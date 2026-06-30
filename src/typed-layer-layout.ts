/**
 * @deprecated Thin re-export shim — kept only so existing `./typed-layer-layout.js`
 * imports keep resolving.
 *
 * The layout cores now live in (and ship from) `@sentropic/graph` (>= 0.2.0):
 * `computeTypedLayerPositions`, `computeTimeOrientedPositions`, and the
 * `TypedLayerLayoutOptions` / `TimeOrientedLayoutOptions` types.
 *
 * graphify previously VENDORED byte-identical copies of those helpers here
 * because the published `@sentropic/graph@^0.1.0` did NOT export them, which
 * crashed the installed CLI at load with
 *   SyntaxError: ... does not provide an export named 'computeTypedLayerPositions'
 * (the #238 smoke-test regression). Once `@sentropic/graph@0.2.0` published with
 * the full layout surface and graphify's dependency floor was bumped to ^0.2.0,
 * the vendored copies were retired in favour of the package exports — see
 * `packages/graph/PUBLISHING.md` and `src/scene-layout.ts`.
 *
 * New code should import these symbols from `@sentropic/graph` directly.
 */
export {
  computeTimeOrientedPositions,
  computeTypedLayerPositions,
} from "@sentropic/graph";
export type {
  TimeOrientedLayoutOptions,
  TypedLayerLayoutOptions,
} from "@sentropic/graph";
