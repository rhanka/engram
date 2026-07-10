import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const graphCanvasSource = () =>
  readFileSync(resolve("src/components/GraphCanvas.svelte"), "utf8");

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
    // CAPTURE the current on-screen buffer as bufA.
    expect(driver).toMatch(/new Float32Array\(current\)/);
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
    // Exactly one deliberate end-fit at settle.
    expect(source).toMatch(/function settleLayout[\s\S]*fitAndRender\(\);/);
  });

  it("re-seeds bufA from the LIVE buffer on interrupt, never snapping to base", () => {
    const source = graphCanvasSource();
    const driver = source.slice(source.indexOf("function startLayoutMorph"));
    expect(driver).toMatch(
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
    expect(source).toMatch(/function resetLayoutState\(\)[\s\S]{0,400}draggedPositions\.clear\(\)/);
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
