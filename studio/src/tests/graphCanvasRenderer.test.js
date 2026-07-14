import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const graphCanvasSource = () =>
  readFileSync(resolve("src/components/GraphCanvas.svelte"), "utf8");

// resetLayoutState()'s own body, bounded to the NEXT function — used instead
// of a fixed-size [\s\S]{0,N} window so a comment added anywhere inside it
// (e.g. remark 2/7's hoverIntent.cancel() / cancelCameraTween() cleanup)
// can't silently push a later assertion out of range.
const resetLayoutStateBody = (source) =>
  source.slice(
    source.indexOf("function resetLayoutState"),
    source.indexOf("function currentLayoutBuffer"),
  );

describe("GraphCanvas renderer", () => {
  it("uses the @sentropic/graph renderer instead of the design-system ForceGraph", () => {
    const source = graphCanvasSource();

    expect(source).toContain('from "@sentropic/graph"');
    expect(source).not.toContain('ForceGraph } from "@sentropic/design-system-svelte"');
    expect(source).toContain("<canvas");
  });

  it("animates mergePair through renderer positions before completing the merge", () => {
    const source = graphCanvasSource();

    expect(source).toContain("MERGE_ANIMATION_DURATION_MS");
    expect(source).toContain("interpolateMergePositions");
    expect(source).toContain("renderer.setPositions");
    expect(source.indexOf("renderer.setPositions")).toBeLessThan(source.indexOf("onMergeComplete?.()"));
  });

  it("boots on the WebGL2 backend (canvas2d fallback) and keeps pointer hover hit testing", () => {
    const source = graphCanvasSource();

    // P6 flip: WebGL2 is the boot default; canvas2d stays the graceful fallback
    // (createBackendRenderer's fellBack path → backendUnavailable).
    expect(source).toMatch(/activeBackend\s*=\s*\$state\(\s*WEBGL2_BACKEND\s*\)/);
    expect(source).toContain("createBackendRenderer");
    expect(source).toContain("backendUnavailable");
    expect(source).toContain("CANVAS2D_BACKEND");
    // hover hit-testing is unchanged.
    expect(source).toContain("findNearestEdge");
    expect(source).toContain("onpointermove");
  });

  // --- P0: Zoom / Pan / Reset ---
  it("adds a wheel listener for zoom centred on the cursor", () => {
    const source = graphCanvasSource();
    expect(source).toContain("onwheel");
    // zoom must use setCamera or mutate camera.zoom
    expect(source).toContain("camera.zoom");
    // zoom must be centred: world point under cursor is preserved → camera.x/y updated
    expect(source).toContain("camera.x");
    expect(source).toContain("camera.y");
  });

  it("pans with pointer drag on the background (pointerdown / pointermove / pointerup)", () => {
    const source = graphCanvasSource();
    expect(source).toContain("onpointerdown");
    expect(source).toContain("onpointerup");
    // pan accumulates delta via camera.x/camera.y
    const hasPan = source.includes("camera.x") && source.includes("camera.y");
    expect(hasPan).toBe(true);
  });

  it("exposes a Reset button that calls renderer.fitView and re-renders", () => {
    const source = graphCanvasSource();
    // button with some reset label / aria
    expect(source.toLowerCase()).toMatch(/reset/);
    // triggers fitAndRender or fitView
    expect(source).toMatch(/fitAndRender|fitView/);
  });

  it("respects prefers-reduced-motion by not adding JS animation for pan/zoom", () => {
    const source = graphCanvasSource();
    // No requestAnimationFrame or transition for camera pan/zoom
    // (rAF is fine for merge animation but not zoom/pan per spec)
    // Simply verify we're not wrapping zoom/pan delta in rAF loops
    // Presence of prefers-reduced-motion media query OR absence of rAF in zoom handler
    // We test the simpler invariant: zoom/pan apply immediately (setCamera called directly)
    expect(source).toContain("renderer.setCamera");
  });

  // --- P0: Connected-dim is wired from the canvas ---
  it("passes hoveredNodeId down to buildGraphRendererPayload on pointermove", () => {
    const source = graphCanvasSource();
    expect(source).toContain("hoveredNodeId");
    expect(source).toContain("buildGraphRendererPayload");
  });

  it("updates node hover dimming through style buffers without rebuilding the full graph payload", () => {
    const source = graphCanvasSource();
    const hoverBlock = source.slice(source.indexOf("function setHoveredNode"), source.indexOf("function handlePointerLeave"));

    expect(hoverBlock).toContain("buildConnectedDimStyle");
    expect(hoverBlock).not.toContain("buildGraphRendererPayload");
  });

  it("keeps edge hover visible with tooltip, relation callback, and emphasized style", () => {
    const source = graphCanvasSource();

    expect(source).toContain("edge-tooltip");
    expect(source).toContain("onEdgeHover");
    expect(source).toContain("HOVER_EDGE_COLOR");
    expect(source).toContain("findNearestEdge");
  });

  it("gives a valid edge hit priority whenever the cursor is outside a node glyph", () => {
    const source = graphCanvasSource();
    const pointerMove = source.slice(
      source.indexOf("function handlePointerMove"),
      source.indexOf("function setHoveredNode"),
    );

    expect(pointerMove).toContain("const preferEdge = edgeHit !== null && !onNodeGlyph");
    expect(pointerMove).toContain("const preferNode = nodeHit !== null && !preferEdge");
    expect(pointerMove).not.toContain("nodeNorm <= edgeNorm");
  });

  it("reapplies edge emphasis after a delayed connected-dim style settles", () => {
    const source = graphCanvasSource();
    const applyDim = source.slice(
      source.indexOf("function applyConnectedDim"),
      source.indexOf("function requestConnectedDim"),
    );
    expect(applyDim).toContain("renderHoverStyle(hoveredEdge)");
  });

  // --- P1: Node hover tooltip ---
  it("shows a node tooltip on hover with label, type/node_type, and degree", () => {
    const source = graphCanvasSource();
    expect(source).toContain("hoveredNode");
    // tooltip element rendered when hoveredNode is set
    expect(source).toContain("node-tooltip");
    // shows at least label and degree
    expect(source).toMatch(/\.label/);
    expect(source).toMatch(/degree|degré/i);
  });

  // --- Item 2: boxed labels for god-nodes ---
  it("computes the boxed-label set from a degree threshold and renders a label overlay", () => {
    const source = graphCanvasSource();
    // exposed factor matching the legacy export.ts font rule (deg >= 0.15 * maxDeg)
    expect(source).toContain("LABEL_DEGREE_RATIO");
    expect(source).toContain("labelDegreeRatio");
    expect(source).toMatch(/0\.15/);
    // label set computed from degree >= ratio * max
    expect(source).toMatch(/labelDegreeRatio\s*\*\s*max/);
    // overlay layer + world->screen positioning reusing the camera transform
    expect(source).toContain("node-labels");
    expect(source).toContain("worldToScreen");
    expect(source).toContain("updateLabels");
  });

  // --- Item 3: node dragging ---
  it("starts a node drag on pointerdown over a node and moves it via setPositions", () => {
    const source = graphCanvasSource();
    expect(source).toContain("draggingNodeId");
    expect(source).toContain("DRAG_MOVE_THRESHOLD");
    // pointerdown over a node begins a drag (no longer an early return)
    expect(source).toMatch(/handlePointerDown[\s\S]*draggingNodeId\s*=\s*id/);
    // drag moves only the dragged node through renderer.setPositions
    expect(source).toMatch(/dragNodeTo[\s\S]*renderer\.setPositions/);
    // a real drag suppresses the trailing click so it doesn't also select
    expect(source).toContain("suppressNextClick");
    // background pointerdown still pans
    expect(source).toContain("isPanning = true");
  });
});

// --- codeflow-parity Lot 1: layout switcher + all-node morph tween ----------
// jsdom has no WebGL, so (like the merge-animation test above) we assert against
// the .svelte SOURCE that the switcher path is wired: selecting a mode CAPTURES
// the current buffer, COMPUTES the target, and drives renderer.setPositions.
describe("GraphCanvas layout switcher + morph (Lot 1)", () => {
  it("renders a DS ButtonGroup switcher gated on showLayoutSwitcher", () => {
    const source = graphCanvasSource();
    expect(source).toContain("showLayoutSwitcher");
    expect(source).toMatch(/\{#if showLayoutSwitcher\}/);
    expect(source).toContain("ButtonGroup");
    expect(source).toContain("LAYOUT_MODES");
    // Choosing a mode invokes the morph driver.
    expect(source).toMatch(/onclick=\{\(\) => selectLayoutMode\(mode\.id\)\}/);
  });

  it("selecting a mode captures→computes→calls setPositions (the morph driver)", () => {
    const source = graphCanvasSource();
    const driver = source.slice(
      source.indexOf("function startLayoutMorph"),
      source.indexOf("// Stable content signature of a scene"),
    );
    // CAPTURE the current on-screen buffer as bufA (via the shared helper so
    // Lot 3 force re-solves can warm-start from the same source of truth).
    expect(source).toContain("function currentLayoutBuffer");
    expect(driver).toContain("currentLayoutBuffer()");
    // COMPUTE the target buffer for the chosen mode.
    expect(driver).toContain("computeLayoutBuffer(payload, mode");
    // DRIVE the tween through the all-node morph + renderer.setPositions.
    expect(driver).toContain("morphPositions(bufA, bufB");
    expect(driver).toContain("renderer.setPositions(liveMorphBuffer)");
  });

  it("hides labels + locks interaction for the morph, and fits exactly once at t=1", () => {
    const source = graphCanvasSource();
    // Labels hidden while morphing.
    expect(source).toMatch(/morphActive = true;\s*\n\s*setLabelsHidden\(true\)/);
    // Interaction is locked (pointer/click/wheel guarded on morphActive).
    expect(source).toMatch(/function handlePointerMove[\s\S]{0,120}if \(morphActive\) return;/);
    expect(source).toMatch(/function handleWheel[\s\S]{0,120}if \(morphActive\)/);
    // Exactly one deliberate end-fit at settle. Remark 7: it's the ANIMATED
    // fit (camera tweens to the target instead of snapping), not the instant
    // one used by mount/resize/"Reset view".
    const settle = source.slice(
      source.indexOf("function settleLayout"),
      source.indexOf("function startLayoutMorph"),
    );
    expect(settle).toContain("animateFitAndRender();");
    expect(settle).not.toMatch(/(?<!animate)fitAndRender\(\);/);
  });

  it("re-seeds bufA from the LIVE buffer on interrupt, never snapping to base", () => {
    const source = graphCanvasSource();
    const helper = source.slice(source.indexOf("function currentLayoutBuffer"));
    expect(helper).toMatch(
      /layoutMorphFrame !== null && liveMorphBuffer\s*\n?\s*\?\s*new Float32Array\(liveMorphBuffer\)/,
    );
  });

  it("guards the selection $effect from clobbering the morph (reapplyLayoutPositions)", () => {
    const source = graphCanvasSource();
    // rebuildPayload re-applies the live morph / active layout buffer, like the
    // dragged-position re-application, so a mid-morph rebuild can't clobber it.
    expect(source).toContain("reapplyLayoutPositions");
    expect(source).toMatch(/function reapplyLayoutPositions[\s\S]*morphActive \? liveMorphBuffer : activeLayoutBuffer/);
    expect(source).toMatch(/reapplyLayoutPositions\(\);\s*\n\s*reapplyDraggedPositions\(\);/);
  });

  it("never tweens across a scene-content change (resetLayoutState before updateGraph)", () => {
    const source = graphCanvasSource();
    expect(source).toMatch(/resetLayoutState\(\);\s*\n\s*updateGraph\(\);/);
    // Force target is the CACHED force positions (no cold re-solve in Lot 1).
    expect(source).toContain("captureForceBaseBuffer");
    expect(source).toContain("forceBuffer: forceBaseBuffer");
  });

  // --- Review must-fixes (double-consensus) ---
  it("F1: clears dragged positions on a layout switch so stale drags can't re-snap", () => {
    const source = graphCanvasSource();
    const driver = source.slice(
      source.indexOf("function startLayoutMorph"),
      source.indexOf("// Stable content signature of a scene"),
    );
    // A layout switch re-places every node → drop the stale Force-space drag map.
    expect(driver).toContain("draggedPositions.clear()");
    // resetLayoutState also clears it (scene change + abnormal-exit path).
    expect(resetLayoutStateBody(source)).toContain("draggedPositions.clear()");
  });

  it("F2: a throwing morph frame unwinds instead of leaving the canvas locked", () => {
    const source = graphCanvasSource();
    const driver = source.slice(source.indexOf("function startLayoutMorph"));
    // The frame body + the priming block are guarded, and the abort path
    // restores a clean, interactive state (resetLayoutState → morphActive false).
    expect(driver).toContain("abortMorph");
    expect(driver).toMatch(/const abortMorph = \(\) => \{[\s\S]*resetLayoutState\(\);[\s\S]*fitAndRender\(\);/);
    expect(driver).toMatch(/\} catch \{\s*\n\s*abortMorph\(\);/);
  });

  it("F3: honors prefers-reduced-motion by settling instantly (no tween)", () => {
    const source = graphCanvasSource();
    expect(source).toContain('window.matchMedia("(prefers-reduced-motion: reduce)")');
    const driver = source.slice(source.indexOf("function startLayoutMorph"));
    // Reduced motion is part of the instant-settle guard (goes straight to settleLayout).
    expect(driver).toMatch(/\|\| prefersReducedMotion\(\)\)/);
    expect(driver).toMatch(/prefersReducedMotion\(\)\)[\s\S]{0,120}settleLayout\(/);
  });
});

// --- codeflow-parity Lot 3: Spread/Links force re-solve controls -------------
describe("GraphCanvas force Spread/Links controls (Lot 3)", () => {
  it("renders Spread/Links sliders + Reset inside the workspace toolbar gate", () => {
    const source = graphCanvasSource();
    const gated = source.slice(
      source.indexOf("{#if showLayoutSwitcher}"),
      source.indexOf("<!-- Keyed on the active backend"),
    );
    expect(gated).toContain('aria-label="Force spacing controls"');
    expect(gated).toContain('aria-label="Spread"');
    expect(gated).toContain('aria-label="Links"');
    expect(gated).toContain('aria-label="Reset layout"');
  });

  it("maps Spread→repulsion and Links→linkDistance, warm-starting interactive solves", () => {
    const source = graphCanvasSource();
    // Lot 7: the solve goes through the off-main-thread client (worker + sync fallback).
    expect(source).toContain('import { solveForce, terminateForceWorker } from "../lib/forceLayoutClient.js"');
    const solve = source.slice(
      source.indexOf("function computeForceRelayoutBuffer"),
      source.indexOf("function resetForceLayout"),
    );
    expect(solve).toContain("await solveForce(");
    expect(solve).toContain("repulsion: forceSpread");
    expect(solve).toContain("linkDistance: forceLinks");
    expect(solve).toContain("initialPositions");
    expect(source).toMatch(/function commitForceSpread[\s\S]*resolveForceLayout\(\{ warmStart: true \}\)/);
    expect(source).toMatch(/function commitForceLinks[\s\S]*resolveForceLayout\(\{ warmStart: true \}\)/);
  });

  it("Lot 7: discards a stale worker solve (generation token) and terminates on destroy", () => {
    const source = graphCanvasSource();
    // A solve resolving after the scene changed is dropped (token mismatch).
    expect(source).toMatch(/const token = \+\+forceSolveToken;[\s\S]*token !== forceSolveToken/);
    // resetLayoutState invalidates in-flight solves.
    expect(resetLayoutStateBody(source)).toContain("forceSolveToken++");
    // The worker is torn down when the component is destroyed.
    expect(source).toMatch(/onDestroy\([\s\S]*terminateForceWorker\(\)/);
  });

  it("debounces expensive solves to drag-end and keeps Reset cold/deterministic", () => {
    const source = graphCanvasSource();
    const gated = source.slice(source.indexOf('aria-label="Force spacing controls"'));
    expect(gated).toMatch(/oninput=\{\(event\) => \(forceSpread = Number\(event\.currentTarget\.value\)\)\}/);
    expect(gated).toMatch(/onchange=\{commitForceSpread\}/);
    expect(gated).toMatch(/oninput=\{\(event\) => \(forceLinks = Number\(event\.currentTarget\.value\)\)\}/);
    expect(gated).toMatch(/onchange=\{commitForceLinks\}/);
    expect(source).toMatch(/function resetForceLayout\(\) \{\s*resolveForceLayout\(\{ warmStart: false \}\);\s*\}/);
  });
});

// --- Lot 7 double-consensus review must-fixes --------------------------------
// jsdom has no WebGL, so (as elsewhere) these assert against the .svelte SOURCE
// that the two SERIOUS layout-persistence bugs + the MINOR worker-rejection are
// fixed. Behavioural runtime coverage would need a WebGL canvas the env lacks.
describe("GraphCanvas Lot 7 review must-fixes (double-consensus)", () => {
  it("SERIOUS-1: settleLayout persists the settled buffer for EVERY mode (Force included)", () => {
    const source = graphCanvasSource();
    const settle = source.slice(
      source.indexOf("function settleLayout"),
      source.indexOf("function startLayoutMorph"),
    );
    // The fix: persist the buffer regardless of mode. A Force re-solve (Lot 3
    // Spread/Links/Reset) settles under LAYOUT_MODE_FORCE, so nulling it here
    // would drop the re-solved layout on the next selection/hover rebuild.
    expect(settle).toMatch(/activeLayoutBuffer = buffer \? new Float32Array\(buffer\) : null;/);
    // The old buggy shortcut (null out activeLayoutBuffer for Force) is gone.
    expect(settle).not.toMatch(/mode === LAYOUT_MODE_FORCE \|\| !buffer \? null/);
    // reapplyLayoutPositions still consults activeLayoutBuffer (so Force re-solves
    // are re-applied across a rebuild too, not just non-force layouts).
    expect(source).toMatch(/function reapplyLayoutPositions[\s\S]*morphActive \? liveMorphBuffer : activeLayoutBuffer/);
    // A genuine scene change still nulls it (a NEW scene must use scene positions).
    expect(resetLayoutStateBody(source)).toContain("activeLayoutBuffer = null");
  });

  it("SERIOUS-2: a late Force solve is discarded when the user switched away from Force", () => {
    const source = graphCanvasSource();
    const resolve = source.slice(
      source.indexOf("async function resolveForceLayout"),
      source.indexOf("function resetForceLayout"),
    );
    // resolveForceLayout sets layoutMode = Force synchronously at entry, so a
    // mid-solve switch to Layers/Grid/Radial/Metro flips layoutMode; the
    // continuation must drop the stale solve on that mode mismatch.
    expect(resolve).toMatch(/if \(!target \|\| token !== forceSolveToken \|\| !mounted \|\| layoutMode !== LAYOUT_MODE_FORCE\)/);
  });

  it("MINOR-1: computeForceRelayoutBuffer wraps the worker solve in try/catch → null on error", () => {
    const source = graphCanvasSource();
    const compute = source.slice(
      source.indexOf("async function computeForceRelayoutBuffer"),
      source.indexOf("async function resolveForceLayout"),
    );
    // The await must be guarded so a worker rejection can't escape as an
    // unhandled rejection in the fire-and-forget caller.
    expect(compute).toMatch(/try \{\s*\n\s*solved = await solveForce\(/);
    expect(compute).toMatch(/\} catch \{\s*\n\s*return null;\s*\n\s*\}/);
  });
});

// --- codeflow-parity Lots 4/5: Curved-links + Color-by controls -------------
// jsdom can't mount the WebGL-bearing canvas, so (as with the Lot 1 switcher) we
// assert against the .svelte SOURCE that the controls are wired: gated on
// showLayoutSwitcher, they flip state and re-style LIVE via a payload rebuild that
// preserves the camera (applyPayloadNoFit) — no morph, no layout recompute.
describe("GraphCanvas Curved-links + Color-by controls (Lots 4/5)", () => {
  it("renders both DS controls inside the showLayoutSwitcher gate", () => {
    const source = graphCanvasSource();
    // Same workspace-only gate as the layout switcher.
    const gated = source.slice(
      source.indexOf("{#if showLayoutSwitcher}"),
      source.indexOf("<!-- Keyed on the active backend"),
    );
    // Color-by segmented control (DS ButtonGroup over COLOR_MODES) + Churn legend.
    expect(gated).toContain("COLOR_MODES");
    expect(gated).toMatch(/onclick=\{\(\) => selectColorMode\(mode\.id\)\}/);
    expect(gated).toContain('aria-label="Degree colour legend"');
    // Curved-links DS Switch.
    expect(gated).toContain("Switch");
    expect(gated).toContain('label="Curved links"');
    expect(gated).toContain("checked={curvedLinks}");
    expect(gated).toContain("onchange={toggleCurvedLinks}");
  });

  it("imports the color-by constants + DS Switch", () => {
    const source = graphCanvasSource();
    expect(source).toContain("COLOR_BY_FOLDER");
    expect(source).toContain("COLOR_BY_LAYER");
    expect(source).toContain("COLOR_BY_CHURN");
    // Remark 4: the toolbar now also imports IconButton + Popover (gear menu).
    expect(source).toMatch(
      /import \{ Button, ButtonGroup, IconButton, Popover, Switch \} from "@sentropic\/design-system-svelte"/,
    );
  });

  it("defaults match today's behaviour (curved ON, colour by Folder)", () => {
    const source = graphCanvasSource();
    expect(source).toMatch(/let curvedLinks = \$state\(true\)/);
    expect(source).toMatch(/let colorMode = \$state\(COLOR_BY_FOLDER\)/);
  });

  it("passes colorBy + curvedLinks through rebuildPayload", () => {
    const source = graphCanvasSource();
    const rebuild = source.slice(
      source.indexOf("function rebuildPayload"),
      source.indexOf("function reapplyLayoutPositions"),
    );
    expect(rebuild).toContain("colorBy: colorMode");
    expect(rebuild).toContain("curvedLinks,");
  });

  it("a control change re-styles LIVE (rebuild + applyPayloadNoFit, no morph/fit)", () => {
    const source = graphCanvasSource();
    // Reactive effect reads both deps and calls the live re-style. The imperative
    // work is untrack()ed so the effect depends ONLY on curvedLinks/colorMode (not
    // on hoveredNodeId, which rebuildPayload reads — see the edge-hover fix).
    expect(source).toMatch(/curvedLinks;\s*\n\s*colorMode;[\s\S]*?untrack\(\(\) => updateDisplayStyle\(\)\);/);
    const restyle = source.slice(
      source.indexOf("function updateDisplayStyle"),
      source.indexOf("function toggleCurvedLinks"),
    );
    // No re-fit (preserve camera) and no morph — same shape as updateSelection.
    expect(restyle).toContain("applyPayloadNoFit()");
    expect(restyle).not.toContain("fitAndRender");
    expect(restyle).not.toContain("startLayoutMorph");
  });
});

// --- Configurable edge-transparency: Edge fade + Edge opacity controls -------
// jsdom can't mount the WebGL canvas, so (as with the Lot 1/4/5 controls) we
// assert against the .svelte SOURCE that the controls are wired: an Edge-fade
// segmented group + an Edge-opacity slider in the gated Display section, both
// re-styling LIVE via the same $effect that reacts to curvedLinks/colorMode.
describe("GraphCanvas edge-transparency controls (Edge fade + Edge opacity)", () => {
  const gatedSource = (source) =>
    source.slice(
      source.indexOf("{#if showLayoutSwitcher}"),
      source.indexOf("<!-- Keyed on the active backend"),
    );

  it("imports the edge-alpha constants + default opacity", () => {
    const source = graphCanvasSource();
    expect(source).toContain("EDGE_ALPHA_DENSE");
    expect(source).toContain("EDGE_ALPHA_INVERSE");
    expect(source).toContain("EDGE_ALPHA_MID");
    expect(source).toContain("EDGE_ALPHA_FLAT");
    expect(source).toContain("DEFAULT_EDGE_OPACITY");
  });

  it("defaults to dense fade + the default edge opacity", () => {
    const source = graphCanvasSource();
    expect(source).toMatch(/let edgeAlphaMode = \$state\(EDGE_ALPHA_DENSE\)/);
    expect(source).toMatch(/let edgeOpacity = \$state\(DEFAULT_EDGE_OPACITY\)/);
  });

  it("renders the Edge fade segmented group (English labels) + Edge opacity slider in the Display section", () => {
    const source = graphCanvasSource();
    const gated = gatedSource(source);
    // Segmented Edge-fade control over EDGE_FADE_MODES.
    expect(gated).toContain("EDGE_FADE_MODES");
    expect(gated).toContain('class="edge-fade-switcher"');
    expect(gated).toMatch(/onclick=\{\(\) => selectEdgeAlphaMode\(mode\.id\)\}/);
    expect(gated).toContain('aria-label={`Edge fade ${mode.label}`}');
    // English labels for every mode.
    expect(source).toMatch(/\{ id: EDGE_ALPHA_DENSE, label: "Dense" \}/);
    expect(source).toMatch(/\{ id: EDGE_ALPHA_INVERSE, label: "Inverse" \}/);
    expect(source).toMatch(/\{ id: EDGE_ALPHA_MID, label: "Mid" \}/);
    expect(source).toMatch(/\{ id: EDGE_ALPHA_FLAT, label: "Flat" \}/);
    // Native range slider for the base opacity.
    expect(gated).toContain('aria-label="Edge opacity"');
    expect(gated).toMatch(/type="range"[\s\S]{0,120}min="0\.1"[\s\S]{0,120}max="0\.8"/);
    expect(gated).toMatch(/oninput=\{\(event\) => \(edgeOpacity = Number\(event\.currentTarget\.value\)\)\}/);
  });

  it("passes edgeAlphaMode + edgeOpacity through rebuildPayload", () => {
    const source = graphCanvasSource();
    const rebuild = source.slice(
      source.indexOf("function rebuildPayload"),
      source.indexOf("function reapplyLayoutPositions"),
    );
    expect(rebuild).toContain("edgeAlphaMode,");
    expect(rebuild).toContain("edgeOpacity,");
  });

  it("re-styles LIVE from the SAME effect (new deps added, untrack kept)", () => {
    const source = graphCanvasSource();
    // The curved/color effect now also reads edgeAlphaMode + edgeOpacity, and
    // still wraps the imperative work in untrack (edge-hover fix must survive).
    expect(source).toMatch(
      /curvedLinks;\s*\n\s*colorMode;[\s\S]*?edgeAlphaMode;\s*\n\s*edgeOpacity;[\s\S]*?untrack\(\(\) => updateDisplayStyle\(\)\);/,
    );
  });
});

// --- Studio representation-polish remarks 4/5/6: gear-menu settings popover -
describe("GraphCanvas settings popover (remarks 4/5/6)", () => {
  const toolbarGate = (source) =>
    source.slice(
      source.indexOf("{#if showLayoutSwitcher}"),
      source.indexOf("<!-- Keyed on the active backend"),
    );

  it("places Reset left of the gear and pins both sm controls to exactly the same height", () => {
    const source = graphCanvasSource();
    const toolbar = source.slice(
      source.indexOf('<div class="canvas-toolbar"'),
      source.indexOf("<!-- Keyed on the active backend"),
    );
    expect(toolbar.indexOf('aria-label="Reset view"')).toBeLessThan(
      toolbar.indexOf('aria-label="Graph display settings"'),
    );
    expect(toolbar).toMatch(/<Button[\s\S]{0,120}size="sm"[\s\S]{0,120}aria-label="Reset view"/);

    const style = source.slice(source.indexOf("<style>"));
    expect(style).toContain(
      "--st-component-button-anatomy-density-sm-controlHeight: var(--graph-toolbar-control-height)",
    );
    expect(style).toContain(
      "--st-component-iconButton-smSize: var(--graph-toolbar-control-height)",
    );
    expect(style).toMatch(
      /\.canvas-toolbar :global\(\.reset-view-button\),[\s\S]{0,100}\.canvas-toolbar :global\(\.st-iconButton--sm\)[\s\S]{0,160}height: var\(--graph-toolbar-control-height\)/,
    );
  });

  it("R4: collapses layout/spacing/display behind a gear IconButton + Popover, gated on showLayoutSwitcher", () => {
    const source = graphCanvasSource();
    const gated = toolbarGate(source);
    expect(gated).toContain("<Popover");
    expect(gated).toContain('label="Graph display settings"');
    expect(gated).toContain("<IconButton");
    expect(gated).toContain('aria-label="Graph display settings"');
    expect(gated).toContain("onclick={toggleSettings}");
    // The 3 sections codeflow's own settings popover uses.
    expect(gated).toContain('aria-label="Layout"');
    expect(gated).toContain('aria-label="Spacing"');
    expect(gated).toContain('aria-label="Display"');
    expect(gated).toContain(">Layout<");
    expect(gated).toContain(">Spacing<");
    expect(gated).toContain(">Display<");
    // Every control that used to sit directly in the toolbar row now lives
    // inside the popover panel.
    expect(gated).toContain("layout-switcher");
    expect(gated).toContain("force-sliders-row");
    expect(gated).toContain("color-switcher");
    expect(gated).toContain("curved-links-toggle");
  });

  it("R4: the gear toggles `settingsOpen`, dismissed on outside click / Escape", () => {
    const source = graphCanvasSource();
    expect(source).toMatch(/let settingsOpen = \$state\(false\)/);
    expect(source).toMatch(/function toggleSettings\(\)\s*\{\s*settingsOpen = !settingsOpen;/);
    expect(source).toContain("handleSettingsWindowPointerDown");
    expect(source).toContain("handleSettingsWindowKeydown");
    expect(source).toMatch(/event\.key === "Escape"/);
    expect(source).toContain('window.addEventListener("pointerdown", handleSettingsWindowPointerDown)');
    expect(source).toContain('window.removeEventListener("pointerdown", handleSettingsWindowPointerDown)');
  });

  it("R5: every DS control inside the panel is size=\"sm\", overridden to the compact Reset-button font scale", () => {
    const source = graphCanvasSource();
    const panel = source.slice(source.indexOf('{#snippet children()}'), source.indexOf('{/snippet}\n        </Popover>'));
    // No lg/md controls snuck in — every Button/ButtonGroup in the panel is sm.
    expect(panel).not.toMatch(/size="lg"/);
    expect(panel).not.toMatch(/size="md"/);
    const buttonCount = (panel.match(/<Button\b/g) ?? []).length;
    const smCount = (panel.match(/size="sm"/g) ?? []).length;
    expect(buttonCount).toBeGreaterThan(0);
    expect(smCount).toBeGreaterThanOrEqual(buttonCount);
    // The compact font-scale override matches the Reset button's own 0.75rem.
    const style = source.slice(source.indexOf("<style>"));
    expect(style).toMatch(/\.graph-settings-panel\s*\{[^}]*font-size:\s*0\.75rem/);
    expect(style).toMatch(/--st-component-button-anatomy-density-sm-fontSize:\s*0\.75rem/);
    expect(style).toMatch(/\.graph-settings-panel :global\(\.st-switch__label\)\s*\{\s*font-size:\s*0\.75rem/);
  });

  it("R6: Spread/Links sit on their own row and are disabled whenever layoutMode isn't Force", () => {
    const source = graphCanvasSource();
    const gated = toolbarGate(source);
    const sliders = gated.slice(gated.indexOf("force-sliders-row"), gated.indexOf("force-reset-row"));
    // Both sliders (and their wrapping labels) are disabled off-Force.
    // (?<!-) excludes the tail of "class:is-disabled={...}" (below), which
    // would otherwise also match the plain "disabled={...}" substring.
    expect((sliders.match(/(?<!-)disabled=\{layoutMode !== LAYOUT_MODE_FORCE\}/g) ?? []).length).toBe(2);
    expect((sliders.match(/class:is-disabled=\{layoutMode !== LAYOUT_MODE_FORCE\}/g) ?? []).length).toBe(2);
    // Reset (same force re-solve) is disabled off-Force too.
    const resetRow = gated.slice(gated.indexOf("force-reset-row"));
    expect(resetRow).toMatch(/aria-label="Reset layout"[\s\S]{0,80}disabled=\{layoutMode !== LAYOUT_MODE_FORCE\}/);
  });
});

// --- Studio representation-polish remark 7: smooth camera recenter ---------
describe("GraphCanvas smooth recenter (remark 7)", () => {
  it("settleLayout tweens the camera to the fit target instead of snapping", () => {
    const source = graphCanvasSource();
    expect(source).toContain("function animateFitAndRender");
    // Shares the node-morph's duration + easing so the recenter reads as one
    // continuous motion with the just-finished layout morph.
    expect(source).toMatch(/function animateFitAndRender[\s\S]*LAYOUT_MORPH_DURATION_MS/);
    expect(source).toMatch(/function animateFitAndRender[\s\S]*easeMergeProgress/);
    expect(source).toMatch(/function animateFitAndRender[\s\S]*renderer\.setCamera\(camera\)/);
    // §F3 parity: reduced-motion snaps instead of tweening.
    expect(source).toMatch(/function animateFitAndRender[\s\S]{0,800}prefersReducedMotion\(\)/);
  });

  it("mount/resize/Reset-view keep the INSTANT fit; only settleLayout uses the tween", () => {
    const source = graphCanvasSource();
    const applyPayload = source.slice(
      source.indexOf("function applyPayload()"),
      source.indexOf("function applyPayloadNoFit"),
    );
    expect(applyPayload).toContain("fitAndRender();");
    expect(applyPayload).not.toContain("animateFitAndRender");
    expect(source).toMatch(/aria-label="Reset view"[\s\S]{0,40}onclick=\{fitAndRender\}/);
  });

  it("cancels the camera tween when a new interaction/morph supersedes it", () => {
    const source = graphCanvasSource();
    expect(source).toContain("function cancelCameraTween");
    // A new node morph, a scene reset, and starting to pan/zoom all cancel a
    // stale camera tween instead of fighting it.
    expect(source).toMatch(/function startLayoutMorphToBuffer[\s\S]{0,700}cancelCameraTween\(\);/);
    expect(resetLayoutStateBody(source)).toContain("cancelCameraTween();");
    expect(source).toMatch(/function handlePointerDown[\s\S]{0,400}cancelCameraTween\(\);/);
    expect(source).toMatch(/function handleWheel[\s\S]{0,400}cancelCameraTween\(\);/);
    // Cleaned up on unmount so no stray rAF outlives the component.
    expect(source).toMatch(/cancelLayoutMorphFrame\(\);\s*\n\s*cancelCameraTween\(\);/);
  });
});

// --- Collapse/expand GROUP transition animation (redesign spec §3) ----------
// jsdom has no WebGL (like the merge/layout-morph tests above), so we assert
// against the .svelte SOURCE that the CORRECTED animated group/ungroup transition
// is wired: an optional groupTransition prop; a scene-effect that consumes the
// descriptor ONCE and hands off to the driver; a driver that swaps through the
// position-preserving applyCarriedScene (NEVER a refit) — collapse tweens on the
// OLD payload then carried-swaps, expand carried-swaps FIRST then tweens on the
// NEW payload; a groupSwapPending deferral + selectedIds content-signature that
// stop the same-flush rebuild that killed collapse (RC-B); and settleGroupTween
// persisting the layout buffer (RC-E). The BEHAVIOURAL maths of the swap/fan/fold
// (carryScenePositions / goldenAngleFan / resolveGroupFolds) are unit-tested in
// graphRendererPayload.test.js.
describe("GraphCanvas collapse/expand group transition", () => {
  const driverSource = (source) =>
    source.slice(
      source.indexOf("// --- Collapse/expand GROUP transition driver"),
      source.indexOf("// Stable content signature of a scene"),
    );

  it("accepts an optional groupTransition prop (absent ⇒ current behaviour)", () => {
    const source = graphCanvasSource();
    expect(source).toMatch(/groupTransition = null,/);
  });

  it("consumes the descriptor ONCE and hands off to the driver, falling back to refit", () => {
    const source = graphCanvasSource();
    // untrack so groupTransition is not a hidden dependency of the scene effect.
    expect(source).toMatch(/const raw = untrack\(\(\) => groupTransition\);/);
    // RC-D: consumed-once reference guard — only a GENUINELY new descriptor is fresh.
    expect(source).toMatch(/const fresh = raw && raw !== lastConsumedGroupTransition \? raw : null;/);
    expect(source).toMatch(/if \(fresh\) lastConsumedGroupTransition = raw;/);
    expect(source).toMatch(/untrack\(\(\) => tryStartGroupTransition\(fresh\)\)/);
    // A redundant tick (no fresh descriptor) mid-tween must NOT rebuild.
    expect(source).toMatch(/if \(groupTweenFrame !== null && !fresh\) return;/);
    // §3.7 interrupt: a genuine new transition mid-tween completes the pending swap
    // synchronously before starting the next one.
    expect(source).toMatch(
      /if \(groupTweenFrame !== null && fresh && pendingGroupSettle\) \{\s*\n\s*cancelGroupTweenFrame\(\);\s*\n\s*pendingGroupSettle\(\);/,
    );
    // On a handled transition the effect returns before the refit; otherwise the
    // genuine non-group scene change bumps the epoch then resetLayoutState/updateGraph.
    expect(source).toMatch(
      /tryStartGroupTransition\(fresh\)\)\) return;\s*\n[\s\S]{0,320}coordinateEpoch \+= 1;\s*\n\s*resetLayoutState\(\);\s*\n\s*updateGraph\(\);/,
    );
  });

  it("collapse snapshots first, tweens on the OLD payload, then carried-swaps (no refit)", () => {
    const source = graphCanvasSource();
    const driver = driverSource(source);
    expect(driver).toContain("function startCollapseTween");
    // Snapshot the OLD on-screen positions BEFORE the swap (carriedPosById).
    expect(driver).toMatch(/const oldPos = currentPositionMap\(\) \?\? new Map\(\);[\s\S]{0,200}collectGroupFolds\(anchors\)/);
    // Defers concurrent selection rebuilds while the tween runs (RC-B).
    expect(driver).toMatch(/groupSwapPending = true;/);
    // At t=1 it finishes via finishCollapseSwap — NOT resetLayoutState/updateGraph.
    expect(driver).toMatch(/fadeOut: true[\s\S]{0,160}onDone: \(\) => pendingGroupSettle\?\.\(\)/);
    expect(driver).toContain("function finishCollapseSwap");
    expect(driver).toMatch(/function finishCollapseSwap[\s\S]{0,400}applyCarriedScene\(\{ carriedPosById: oldPos/);
    // The collapse path never hard-refits (no resetLayoutState();updateGraph(); pair).
    const collapse = source.slice(source.indexOf("function startCollapseTween"), source.indexOf("function finishCollapseSwap"));
    expect(collapse).not.toMatch(/resetLayoutState\(\);\s*\n\s*updateGraph\(\);/);
  });

  it("expand captures the anchor PRE-swap, carried-swaps FIRST, then tweens on the new payload", () => {
    const source = graphCanvasSource();
    const driver = driverSource(source);
    // RC-C: snapshot + per-group anchor captured BEFORE the swap.
    expect(driver).toMatch(/function startExpandTween[\s\S]{0,320}const oldPos = currentPositionMap\(\)/);
    expect(driver).toMatch(/anchorPosByGroup\.set\(groupId, \{ x: p\.x, y: p\.y \}\)/);
    // Carried swap FIRST (children stacked on the anchor), then resolve on the NEW payload.
    expect(driver).toMatch(/applyCarriedScene\(\{ carriedPosById: oldPos, placedPosById \}\);\s*\n\s*\/\/ 3\. Resolve the revealed children against the NEW payload\.\s*\n\s*const info = collectGroupFolds\(anchors\);/);
    // Targets come from the cache-or-fan helper; tween fades IN.
    expect(driver).toContain("computeExpandTargets(groupMembers, postAnchor, positions)");
    expect(driver).toMatch(/fadeOut: false/);
    // Expand never hard-refits either.
    const expand = source.slice(source.indexOf("function startExpandTween"), source.indexOf("function computeExpandTargets"));
    expect(expand).not.toMatch(/resetLayoutState\(\);\s*\n\s*updateGraph\(\);/);
  });

  it("applyCarriedScene rebuilds, carries by id, persists the layout buffer, and never refits", () => {
    const source = graphCanvasSource();
    const carried = source.slice(
      source.indexOf("function applyCarriedScene"),
      source.indexOf("// Resolve the folding/revealing children"),
    );
    // Rebuild the NEW scene, then OVERWRITE positions by id via the pure carry core.
    expect(carried).toContain("rebuildPayload();");
    expect(carried).toContain("carryScenePositions({");
    // RC-E: persist so later rebuilds don't re-derive scene-baked coords + jump.
    expect(carried).toContain("activeLayoutBuffer = new Float32Array(graph.positions)");
    expect(carried).toContain("forceBaseBuffer = new Float32Array(graph.positions)");
    // Ends with the no-fit apply — never fitAndRender.
    expect(carried).toContain("applyPayloadNoFit()");
    expect(carried).not.toMatch(/(?<!animate)fitAndRender\(/);
  });

  it("settleGroupTween persists activeLayoutBuffer/forceBaseBuffer + clears the swap flag (RC-E)", () => {
    const source = graphCanvasSource();
    const settle = source.slice(
      source.indexOf("function settleGroupTween"),
      source.indexOf("function runGroupTween"),
    );
    expect(settle).toContain("activeLayoutBuffer = new Float32Array(positions)");
    expect(settle).toContain("forceBaseBuffer = new Float32Array(positions)");
    expect(settle).toContain("groupSwapPending = false");
    // Refreshes the expand-restore cache for the settled ids.
    expect(settle).toContain("lastKnownPosById.set");
  });

  it("defers selection/display rebuilds under a collapse tween, applying once post-swap (RC-B)", () => {
    const source = graphCanvasSource();
    // Both restyle paths bail out while groupSwapPending, queuing a single restyle.
    const selection = source.slice(
      source.indexOf("function updateSelection"),
      source.indexOf("function updateDisplayStyle"),
    );
    expect(selection).toMatch(/if \(groupSwapPending\) \{\s*\n\s*pendingPostSwapRestyle = true;\s*\n\s*return;/);
    const display = source.slice(
      source.indexOf("function updateDisplayStyle"),
      source.indexOf("function toggleCurvedLinks"),
    );
    expect(display).toMatch(/if \(groupSwapPending\) \{\s*\n\s*pendingPostSwapRestyle = true;\s*\n\s*return;/);
    // The deferred restyle is flushed ONCE inside the settle.
    expect(source).toMatch(/if \(pendingPostSwapRestyle\) \{\s*\n\s*pendingPostSwapRestyle = false;\s*\n\s*updateSelection\(\);/);
  });

  it("hardens the selection $effect with a content signature (fresh-array no-op guard, §3.3)", () => {
    const source = graphCanvasSource();
    expect(source).toContain("function selectionSignature");
    expect(source).toMatch(/const key = selectionSignature\(selectedIds, focusId\);/);
    expect(source).toMatch(/if \(key === lastSelectionKey\) return;/);
    // The untrack on updateSelection MUST survive (edge-hover / hidden-dep fix).
    expect(source).toMatch(/untrack\(\(\) => updateSelection\(\)\);/);
  });

  it("a layout-mode switch is a no-op while a group tween owns the payload (§3.3)", () => {
    const source = graphCanvasSource();
    expect(source).toMatch(/function selectLayoutMode\(mode\) \{\s*\n[\s\S]{0,300}if \(groupTweenFrame !== null\) return;/);
  });

  it("REUSES morphPositions + the merge-fade style on the rAF loop, locking morphActive", () => {
    const source = graphCanvasSource();
    const driver = driverSource(source);
    // Same all-node position lerp as the layout morph, into the reused buffer.
    expect(driver).toContain("morphPositions(bufA, bufB, eased, liveMorphBuffer)");
    expect(driver).toContain("renderer.setPositions(liveMorphBuffer)");
    // The merge-fade pattern generalized to a SET of folding nodes (alpha+size).
    expect(driver).toContain("interpolateGroupFadeStyle(payload, foldingSet, alphaScale, sizeScale)");
    // Interaction is locked exactly like the layout morph.
    expect(driver).toMatch(/morphActive = true;\s*\n\s*setLabelsHidden\(true\)/);
    // Driven on requestAnimationFrame with the shared duration + easing.
    expect(driver).toContain("LAYOUT_MORPH_DURATION_MS");
    expect(driver).toContain("easeMergeProgress(progress)");
    expect(driver).toContain("window.requestAnimationFrame(step)");
  });

  it("SAFETY: no renderer / SSR / reduced-motion / abnormal frame settle position-preserving", () => {
    const source = graphCanvasSource();
    const driver = driverSource(source);
    // tryStart returns false (→ refit fallback) without a renderer/payload/anchors.
    expect(driver).toMatch(/function tryStartGroupTransition[\s\S]{0,260}return false;/);
    // An EMPTY on-screen fold set is NOT a hard cut — collapse still carried-swaps.
    expect(driver).toMatch(/if \(!info\) \{\s*\n[\s\S]{0,200}finishCollapseSwap\(oldPos, new Map\(\), anchors\);/);
    // The tween honours prefers-reduced-motion + missing rAF (settle to end state).
    expect(driver).toContain("prefersReducedMotion()");
    // §3.7: an abnormal frame JUMPS to the end state (onDone) first; fitAndRender
    // is only the absolute last resort if that also throws.
    expect(driver).toMatch(/const abort = \(\) => \{[\s\S]{0,200}try \{\s*\n\s*onDone\?\.\(\);\s*\n\s*\} catch \{[\s\S]{0,120}fitAndRender\(\);/);
    expect(driver).toMatch(/\} catch \{\s*\n\s*abort\(\);/);
  });

  it("cleans up the group tween on scene reset and on destroy", () => {
    const source = graphCanvasSource();
    // resetLayoutState cancels an in-flight group tween (indices are stale after).
    expect(resetLayoutStateBody(source)).toContain("cancelGroupTweenFrame()");
    // Unmount cancels it too, so no stray rAF outlives the component.
    expect(source).toMatch(/cancelMergeFrame\(\);\s*\n\s*cancelGroupTweenFrame\(\);/);
  });
});

// --- 4-STATE visibility: unified transition routing (Hide/Show/Solo) ----------
// The SPINE: Hide/Solo route through the SAME carry-over tween as group/ungroup
// via a content-derived visibility delta. jsdom has no WebGL, so (as elsewhere)
// we assert the .svelte SOURCE wires the extended descriptor + the in-place fade.
describe("GraphCanvas 4-state visibility transition (Hide/Show/Solo)", () => {
  const driverSource = (source) =>
    source.slice(
      source.indexOf("// --- Collapse/expand GROUP transition driver"),
      source.indexOf("// Stable content signature of a scene"),
    );

  it("documents the UNIFIED descriptor shape on the prop", () => {
    const source = graphCanvasSource();
    expect(source).toMatch(/hiddenIds: Set<nodeId>, revealedIds: Set<nodeId>, kind: "out"\|"in"\|"mixed"/);
    expect(source).toMatch(/groupTransition = null,/);
  });

  it("routes by KIND: out→collapse(+hide), in→expand(+reveal), mixed→carried swap", () => {
    const source = graphCanvasSource();
    const driver = driverSource(source);
    expect(driver).toMatch(/if \(transition\.kind === "out"\) return startCollapseTween\(folded, hiddenIds\);/);
    expect(driver).toMatch(/if \(transition\.kind === "in"\) return startExpandTween\(unfolded, revealedIds\);/);
    expect(driver).toMatch(/if \(transition\.kind === "mixed"\)\s*\n\s*return applyMixedCarriedSwap\(/);
    // The unknown/absent path still returns false (refit fallback).
    expect(driver).toMatch(/function tryStartGroupTransition[\s\S]{0,300}return false;/);
  });

  it("hidden nodes fade IN PLACE (bufB stays == bufA) — never toward an anchor", () => {
    const source = graphCanvasSource();
    const driver = driverSource(source);
    // The in-place index helper resolves display-hidden/revealed ids on screen.
    expect(driver).toContain("function collectInPlaceIndices");
    // startCollapseTween unions the fold set with the in-place hidden indices…
    expect(driver).toMatch(/function startCollapseTween\(anchors, hiddenIds = new Set\(\)\)/);
    expect(driver).toMatch(/const inPlaceIdx = collectInPlaceIndices\(hiddenIds\);/);
    expect(driver).toMatch(/for \(const i of inPlaceIdx\) foldingSet\.add\(i\);/);
    // …and NEVER overwrites the hidden slots in bufB (they stay == bufA).
    expect(driver).toMatch(/Hidden nodes: bufB stays == bufA/);
  });

  it("revealed nodes fade in at their CACHED same-epoch position (else neighbour)", () => {
    const source = graphCanvasSource();
    const driver = driverSource(source);
    expect(driver).toMatch(/function startExpandTween\(anchors, revealedIds = new Set\(\)\)/);
    expect(driver).toMatch(/for \(const id of revealedIds\) \{\s*\n\s*const cached = lastKnownPosById\.get\(id\);/);
    expect(driver).toMatch(/const revealedIdx = collectInPlaceIndices\(revealedIds\);/);
    expect(driver).toMatch(/for \(const i of revealedIdx\) foldingSet\.add\(i\);/);
  });

  it("finishCollapseSwap caches each HIDDEN node's pre-hide position (for later reveal)", () => {
    const source = graphCanvasSource();
    expect(source).toMatch(/function finishCollapseSwap\(oldPos, placedPosById, anchors, hiddenIds = new Set\(\)\)/);
    const settle = source.slice(
      source.indexOf("function finishCollapseSwap"),
      source.indexOf("function startExpandTween"),
    );
    expect(settle).toMatch(/for \(const id of hiddenIds\) \{[\s\S]{0,120}lastKnownPosById\.set\(id/);
  });

  it("the MIXED path is a carried NON-animated swap — never a refit (D4)", () => {
    const source = graphCanvasSource();
    const mixed = source.slice(
      source.indexOf("function applyMixedCarriedSwap"),
      source.indexOf("// Expand targets"),
    );
    expect(mixed).toContain("applyCarriedScene({ carriedPosById: oldPos, placedPosById })");
    expect(mixed).toContain("settleGroupTween(payload?.renderGraph?.positions)");
    // No tween, no hard refit.
    expect(mixed).not.toContain("runGroupTween");
    expect(mixed).not.toMatch(/resetLayoutState\(\);\s*\n\s*updateGraph\(\);/);
    expect(mixed).not.toMatch(/(?<!animate)fitAndRender\(/);
  });
});
