import { describe, expect, it } from "vitest";

import {
  cameraToViewProjection,
  identity,
  multiply,
  ortho,
  scale,
  transformVec4,
  translate,
} from "../src/mat4";

/**
 * The OLD hand-rolled 2D affine the renderer + shaders used before the mat4
 * unified camera (renderer.ts EDGE/NODE shaders, webgl-shapes SHAPE shader):
 *
 *   screen = (world - camera) * zoom
 *   clip   = (screen.x * 2/vw, -screen.y * 2/vh)
 *   gl_Position = vec4(clip, 0, 1)
 *
 * The mat4 view-projection MUST reproduce this for 2D so the pixels are unchanged.
 */
function legacyAffineClip(
  camera: { x: number; y: number; zoom: number },
  vw: number,
  vh: number,
  wx: number,
  wy: number,
): [number, number, number, number] {
  const screenX = (wx - camera.x) * camera.zoom;
  const screenY = (wy - camera.y) * camera.zoom;
  return [(screenX * 2) / vw, (-screenY * 2) / vh, 0, 1];
}

const CAMERAS = [
  { x: 0, y: 0, zoom: 1 },
  { x: 0, y: 0, zoom: 2.5 },
  { x: 120, y: -45, zoom: 1 },
  { x: -300.5, y: 88.25, zoom: 0.37 },
  { x: 1e4, y: -1e4, zoom: 13 },
];
const VIEWPORTS = [
  [200, 200],
  [400, 250],
  [600, 600],
  [1280, 720],
];
const WORLD_POINTS = [
  [0, 0],
  [10, 10],
  [-50, 25],
  [123.5, -88.25],
  [-1000, 1000],
  [5000, 4000],
];

describe("mat4 helpers (building blocks)", () => {
  it("identity is the neutral element and maps a point to itself", () => {
    const i = identity();
    expect(Array.from(i)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expect(transformVec4(i, 3, -7, 2, 1)).toEqual([3, -7, 2, 1]);
  });

  it("translate then scale compose as scale·translate (translate acts first on a vec)", () => {
    // m = scale(2)·translate(10,20,0); applied to (1,1,0,1):
    //   translate -> (11,21,0,1); scale -> (22,42,0,1).
    const m = multiply(scale(2, 2, 1), translate(10, 20, 0));
    expect(transformVec4(m, 1, 1, 0, 1)).toEqual([22, 42, 0, 1]);
  });

  it("ortho maps the box corners to the clip cube", () => {
    const p = ortho(-100, 100, -50, 50, -1, 1);
    const corners: Array<[[number, number, number, number], number[]]> = [
      [transformVec4(p, 100, 50, 0, 1), [1, 1, 0, 1]],
      [transformVec4(p, -100, -50, 0, 1), [-1, -1, 0, 1]],
      [transformVec4(p, 0, 0, 0, 1), [0, 0, 0, 1]],
    ];
    // float32 storage rounds 1 to 0.99999997, so compare close (not byte-equal).
    for (const [got, want] of corners) {
      for (let i = 0; i < 4; i += 1) expect(got[i]).toBeCloseTo(want[i]!, 5);
    }
  });
});

describe("cameraToViewProjection — byte-parity with the legacy 2D affine", () => {
  it("maps sample world points to the SAME clip coords as the old affine (within fp epsilon)", () => {
    for (const camera of CAMERAS) {
      for (const [vw, vh] of VIEWPORTS) {
        const m = cameraToViewProjection(camera, vw!, vh!);
        for (const [wx, wy] of WORLD_POINTS) {
          const got = transformVec4(m, wx!, wy!, 0, 1);
          const want = legacyAffineClip(camera, vw!, vh!, wx!, wy!);
          // Float32 storage + the matrix multiply round a touch differently than
          // the double-precision affine; 1e-4 is FAR below the golden pixel
          // tolerance yet proves mathematical equivalence.
          expect(got[0]).toBeCloseTo(want[0], 4);
          expect(got[1]).toBeCloseTo(want[1], 4);
          expect(got[2]).toBeCloseTo(want[2], 4);
          expect(got[3]).toBeCloseTo(want[3], 4);
        }
      }
    }
  });

  it("z = 0 maps to clip.z = 0 (legacy `vec4(clip, 0, 1)` parity, no depth shift)", () => {
    const m = cameraToViewProjection({ x: 12, y: 34, zoom: 1.5 }, 800, 600);
    for (const [wx, wy] of WORLD_POINTS) {
      const clip = transformVec4(m, wx!, wy!, 0, 1);
      expect(clip[2]).toBeCloseTo(0, 6);
      expect(clip[3]).toBeCloseTo(1, 6);
    }
  });

  it("camera centre maps to clip origin and the Y axis is flipped (world +y -> clip -y)", () => {
    const camera = { x: 50, y: 50, zoom: 2 };
    const m = cameraToViewProjection(camera, 400, 300);
    // The camera centre sits at the viewport centre = clip (0,0).
    const centre = transformVec4(m, camera.x, camera.y, 0, 1);
    expect(centre[0]).toBeCloseTo(0, 5);
    expect(centre[1]).toBeCloseTo(0, 5);
    // A point ABOVE the camera in world (+y) is HIGHER on screen => clip.y > 0
    // only if NOT flipped; the legacy affine flips Y, so world +y -> clip -y.
    const above = transformVec4(m, camera.x, camera.y + 10, 0, 1);
    expect(above[1]).toBeLessThan(0);
  });

  it("is purely affine in (x,y): the matrix has the expected ortho·zoom·pan structure", () => {
    const camera = { x: 7, y: -3, zoom: 4 };
    const vw = 200;
    const vh = 100;
    const m = cameraToViewProjection(camera, vw, vh);
    // clip.x scale w.r.t world x = zoom*2/vw; clip.y scale w.r.t world y = -zoom*2/vh.
    expect(m[0]).toBeCloseTo((camera.zoom * 2) / vw, 5); // d(clip.x)/d(wx)
    expect(m[5]).toBeCloseTo((-camera.zoom * 2) / vh, 5); // d(clip.y)/d(wy)
    // No cross terms / no z coupling into x,y.
    expect(m[1]).toBeCloseTo(0, 6);
    expect(m[4]).toBeCloseTo(0, 6);
  });
});
