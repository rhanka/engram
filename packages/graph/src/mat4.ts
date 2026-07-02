/**
 * Minimal 4x4 COLUMN-MAJOR matrix helpers for the renderer's UNIFIED CAMERA
 * (mat4 view-projection). This is the FOUNDATION for a future perspective(3D)
 * camera: today every GPU world->clip vertex transform is driven by ONE
 * `u_viewProj` mat4 built from the 2D camera `{x, y, zoom}` via an ORTHOGRAPHIC
 * projection that is mathematically EQUIVALENT to the old hand-rolled affine
 * (pan + zoom + viewport -> clip). Swapping a perspective matrix in later is a
 * one-function change (`cameraToViewProjection`) with no shader churn.
 *
 * Convention: a `Mat4` is a `Float32Array(16)` in OpenGL COLUMN-MAJOR order, so
 * `m[col * 4 + row]` is element (row, col). This matches `gl.uniformMatrix4fv`
 * with `transpose = false` and GLSL `mat4 * vec4` — so {@link transformVec4}
 * below computes the SAME product the vertex shader does.
 */

/** A 4x4 matrix in column-major order (OpenGL convention), length 16. */
export type Mat4 = Float32Array;

/** The 4x4 identity matrix. */
export function identity(): Mat4 {
  const m = new Float32Array(16);
  m[0] = 1;
  m[5] = 1;
  m[10] = 1;
  m[15] = 1;
  return m;
}

/**
 * Matrix product `a · b` (both column-major). `out(r,c) = Σ_k a(r,k)·b(k,c)`.
 * Applying the result to a vector is `a · (b · v)` — i.e. `b` acts first.
 */
export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) {
        // a(row,k) = a[k*4 + row]; b(k,col) = b[col*4 + k]
        sum += (a[k * 4 + row] ?? 0) * (b[col * 4 + k] ?? 0);
      }
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

/** Translation matrix by (tx, ty, tz). */
export function translate(tx: number, ty: number, tz: number): Mat4 {
  const m = identity();
  m[12] = tx;
  m[13] = ty;
  m[14] = tz;
  return m;
}

/** Non-uniform scale matrix by (sx, sy, sz). */
export function scale(sx: number, sy: number, sz: number): Mat4 {
  const m = new Float32Array(16);
  m[0] = sx;
  m[5] = sy;
  m[10] = sz;
  m[15] = 1;
  return m;
}

/**
 * Orthographic projection (classic `glOrtho`, column-major). Maps the box
 * `[left,right] × [bottom,top] × [near,far]` to the clip cube `[-1,1]^3`.
 */
export function ortho(
  left: number,
  right: number,
  bottom: number,
  top: number,
  near: number,
  far: number,
): Mat4 {
  const m = new Float32Array(16);
  m[0] = 2 / (right - left);
  m[5] = 2 / (top - bottom);
  m[10] = -2 / (far - near);
  m[12] = -(right + left) / (right - left);
  m[13] = -(top + bottom) / (top - bottom);
  m[14] = -(far + near) / (far - near);
  m[15] = 1;
  return m;
}

/**
 * Apply a column-major matrix to a homogeneous vector: returns `m · [x,y,z,w]`.
 * This is the EXACT computation a GLSL `mat4 * vec4(x,y,z,w)` performs, so the
 * camera-parity unit test can assert the GPU transform against the old affine.
 */
export function transformVec4(
  m: Mat4,
  x: number,
  y: number,
  z: number,
  w: number,
): [number, number, number, number] {
  return [
    (m[0] ?? 0) * x + (m[4] ?? 0) * y + (m[8] ?? 0) * z + (m[12] ?? 0) * w,
    (m[1] ?? 0) * x + (m[5] ?? 0) * y + (m[9] ?? 0) * z + (m[13] ?? 0) * w,
    (m[2] ?? 0) * x + (m[6] ?? 0) * y + (m[10] ?? 0) * z + (m[14] ?? 0) * w,
    (m[3] ?? 0) * x + (m[7] ?? 0) * y + (m[11] ?? 0) * z + (m[15] ?? 0) * w,
  ];
}

/**
 * Build the UNIFIED 2D view-projection matrix from the camera `{x, y, zoom}` and
 * the DEVICE viewport size, equivalent to the old per-shader affine:
 *
 *   screen = (world - camera) · zoom               // device px, origin = view centre
 *   clip   = (screen.x · 2/vw, -screen.y · 2/vh)   // y flipped to clip space
 *
 * i.e. for a world point `(wx, wy)` and z = 0:
 *   clip.x =  (wx - camera.x) · zoom · 2 / viewportWidth
 *   clip.y = -(wy - camera.y) · zoom · 2 / viewportHeight
 *   clip.z =  0,  clip.w = 1
 *
 * Composed as `ortho · scale(zoom) · translate(-camera)` so it reads as a real
 * orthographic camera. The near/far is symmetric (-1..1) so a z = 0 input maps
 * to clip.z = 0 — byte-identical to the legacy `gl_Position = vec4(clip, 0, 1)`.
 * A future perspective camera replaces THIS function and nothing else.
 */
export function cameraToViewProjection(
  camera: { x: number; y: number; zoom: number },
  viewportWidth: number,
  viewportHeight: number,
): Mat4 {
  // ortho box: x in [-vw/2, vw/2], y in [vh/2, -vh/2] (flip), z in [-1, 1].
  const proj = ortho(
    -viewportWidth / 2,
    viewportWidth / 2,
    viewportHeight / 2,
    -viewportHeight / 2,
    -1,
    1,
  );
  // view = pan to camera origin, then zoom (scale acts AFTER translate on a vec).
  const view = multiply(scale(camera.zoom, camera.zoom, 1), translate(-camera.x, -camera.y, 0));
  return multiply(proj, view);
}
