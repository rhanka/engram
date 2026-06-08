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
});
