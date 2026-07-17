import { describe, expect, it } from "vitest";
import { buildBoxTextDraws, type WebGLBoxFrame } from "../src/webgl-boxes";
import { BOX_SHAPE_CODE } from "../src/render-geometry";

describe("buildBoxTextDraws", () => {
  it("asserts buildBoxTextDraws yields halo === false for a box node even when haloMask bit is set", () => {
    const frame: WebGLBoxFrame = {
      positions: new Float32Array([10, 20]),
      nodeCount: 1,
      style: {
        nodeSizes: new Float32Array([15]),
        nodeColors: new Uint8Array([255, 0, 0, 255]),
        nodeShapes: new Uint8Array([BOX_SHAPE_CODE]),
        haloMask: new Uint8Array([1]),
        haloColor: new Uint8Array([0, 255, 0, 255]),
        nodeLabels: ["Box Node"],
      },
      camera: { x: 0, y: 0, zoom: 1 },
      pixelRatio: 1,
      viewportWidth: 100,
      viewportHeight: 100,
    };

    const draws = buildBoxTextDraws(frame);
    expect(draws).toHaveLength(1);
    expect(draws[0]!.halo).toBe(false);
    expect(draws[0]!.haloColor).toBeUndefined();
  });
});
