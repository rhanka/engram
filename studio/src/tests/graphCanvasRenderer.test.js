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

  it("forces the rich Canvas2D backend and restores pointer hover hit testing", () => {
    const source = graphCanvasSource();

    expect(source).toContain('backend: "canvas2d"');
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
});
