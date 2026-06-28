import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const graphCanvasSource = () =>
  readFileSync(resolve("src/components/GraphCanvas.svelte"), "utf8");

// Task C: edge-skip-during-pan/zoom is now BACKEND-AWARE.
//  - WebGL2: never skip (GPU-instanced edges are cheap).
//  - Canvas2D: skip only past EDGE_SKIP_THRESHOLD, raised after a Skia bench.
describe("GraphCanvas backend-aware edge-skip", () => {
  it("disables edge-skipping entirely on WebGL2 (always renders edges)", () => {
    const source = graphCanvasSource();
    // skipEdgesOnInteract is a $derived gated on the active backend NOT being WebGL2.
    expect(source).toMatch(/skipEdgesOnInteract\s*=\s*\$derived\(/);
    const block = source.slice(
      source.indexOf("skipEdgesOnInteract = $derived("),
      source.indexOf("skipEdgesOnInteract = $derived(") + 220,
    );
    expect(block).toContain("activeBackend !== WEBGL2_BACKEND");
    expect(block).toContain("edgeSkipThreshold");
  });

  it("raises the Canvas2D threshold above mystery scale but below 10k-edge graphs", () => {
    const source = graphCanvasSource();
    const match = source.match(/const EDGE_SKIP_THRESHOLD\s*=\s*(\d+)/);
    expect(match).not.toBeNull();
    const threshold = Number(match[1]);
    // Above mystery scale (1983 nodes + 3693 edges = 5676 objects) so mystery keeps
    // edges live during interaction...
    expect(threshold).toBeGreaterThan(5676);
    // ...but a clear ceiling well below a 10k-edge graph (~15000 objects) so very
    // large graphs still skip edges during pan/zoom (non-regression).
    expect(threshold).toBeLessThan(15000);
  });

  it("no longer recomputes skipEdgesOnInteract imperatively in rebuildPayload", () => {
    const source = graphCanvasSource();
    // The old imperative assignment (skipEdgesOnInteract = objectCount > ...) is gone;
    // the only assignment is the $derived declaration.
    const assigns = source.match(/skipEdgesOnInteract\s*=/g) ?? [];
    expect(assigns.length).toBe(1);
  });
});
