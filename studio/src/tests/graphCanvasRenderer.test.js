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
    expect(gated).toContain('aria-label="Churn colour legend"');
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
    // Reactive effect reads both deps and calls the live re-style.
    expect(source).toMatch(/curvedLinks;\s*\n\s*colorMode;\s*\n\s*updateDisplayStyle\(\);/);
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
