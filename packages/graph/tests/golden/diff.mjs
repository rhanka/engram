// Golden diff: TWO checks per the B1 plan §5.1/§5.2 (both required).
//
//  1. Per-channel pixel tolerance: a pixel passes only if EVERY channel
//     differs by <= T. T is small (absorb AA thrash, R8 -- e.g. <=2-3/255),
//     NOT a blanket "looks close". We report the failing-pixel count and the
//     max channel delta and fail if either exceeds budget.
//
//  2. Geometry probes: sample KNOWN device-pixel coordinates (computed from
//     the fixture + camera) and assert their channel values are within
//     tolerance of an expected color. Probes catch geometry drift (a node
//     moved a few px) that a loose pixel tolerance could mask.

/**
 * Per-channel diff of two RGBA buffers.
 * @param {{width:number,height:number,data:Uint8ClampedArray}} a
 * @param {{width:number,height:number,data:Uint8ClampedArray}} b
 * @param {{ channelTolerance?: number, maxFailingPixels?: number }} budget
 * @returns {{ pass:boolean, dimsMatch:boolean, failingPixels:number,
 *             maxChannelDelta:number, totalPixels:number, reason?:string }}
 */
export function diffPixels(a, b, budget = {}) {
  const channelTolerance = budget.channelTolerance ?? 2;
  const maxFailingPixels = budget.maxFailingPixels ?? 0;

  if (a.width !== b.width || a.height !== b.height) {
    return {
      pass: false,
      dimsMatch: false,
      failingPixels: -1,
      maxChannelDelta: -1,
      totalPixels: 0,
      reason: `dimension mismatch ${a.width}x${a.height} vs ${b.width}x${b.height}`,
    };
  }

  const da = a.data;
  const db = b.data;
  const totalPixels = a.width * a.height;
  let failingPixels = 0;
  let maxChannelDelta = 0;

  for (let i = 0; i < da.length; i += 4) {
    let pixelFails = false;
    for (let c = 0; c < 4; c += 1) {
      const delta = Math.abs(da[i + c] - db[i + c]);
      if (delta > maxChannelDelta) maxChannelDelta = delta;
      if (delta > channelTolerance) pixelFails = true;
    }
    if (pixelFails) failingPixels += 1;
  }

  const pass = failingPixels <= maxFailingPixels;
  return {
    pass,
    dimsMatch: true,
    failingPixels,
    maxChannelDelta,
    totalPixels,
    reason: pass
      ? undefined
      : `${failingPixels} pixel(s) exceed channel tolerance ${channelTolerance} (budget ${maxFailingPixels}); max channel delta ${maxChannelDelta}`,
  };
}

/**
 * Sample one device pixel from a capture.
 * @returns {[number,number,number,number]} rgba
 */
export function samplePixel(capture, x, y) {
  const px = Math.round(x);
  const py = Math.round(y);
  const idx = (py * capture.width + px) * 4;
  return [
    capture.data[idx],
    capture.data[idx + 1],
    capture.data[idx + 2],
    capture.data[idx + 3],
  ];
}

/**
 * Geometry probes: each probe asserts the sampled channel values at a known
 * device coordinate are within tolerance of an expected rgba.
 *
 * @param {object} capture  { width, height, data }
 * @param {Array<{ name:string, x:number, y:number,
 *                 expect:[number,number,number,number], tolerance?:number }>} probes
 * @returns {{ pass:boolean, results:Array<object> }}
 */
export function geometryProbes(capture, probes) {
  const results = probes.map((p) => {
    const got = samplePixel(capture, p.x, p.y);
    const tol = p.tolerance ?? 8;
    const deltas = got.map((g, c) => Math.abs(g - p.expect[c]));
    const maxDelta = Math.max(...deltas);
    const pass = maxDelta <= tol;
    return {
      name: p.name,
      x: Math.round(p.x),
      y: Math.round(p.y),
      expect: p.expect,
      got,
      maxDelta,
      tolerance: tol,
      pass,
    };
  });
  return { pass: results.every((r) => r.pass), results };
}

/**
 * Map a WORLD coordinate to a DEVICE pixel coordinate using the SAME transform
 * the renderer's drawFallback2D uses (screenPoint, renderer.ts:437). The camera
 * operates DIRECTLY in device pixels: the world delta is scaled by camera.zoom
 * ONLY (NOT by pixelRatio) and offset by the device-backing-store half-size.
 * (pixelRatio scales the GLYPH RADIUS at renderer.ts:723, not the position.)
 * y is NOT flipped (canvas + world y both grow downward in screenPoint).
 *
 *   screenX = canvas.width/2  + (worldX - camera.x) * zoom
 *   screenY = canvas.height/2 + (worldY - camera.y) * zoom
 *
 * @returns {[number,number]} device pixel [x,y]
 */
export function worldToDevice(world, { width, height, zoom, camera }) {
  const cam = camera ?? { x: 0, y: 0 };
  const sx = width / 2 + (world[0] - cam.x) * zoom;
  const sy = height / 2 + (world[1] - cam.y) * zoom;
  return [sx, sy];
}

/**
 * Drawn glyph RADIUS in device pixels (renderer.ts:723):
 *   radius = max(1, nodeSize * pixelRatio * zoom)
 */
export function drawnRadius(nodeSize, dpr, zoom) {
  return Math.max(1, nodeSize * dpr * zoom);
}
