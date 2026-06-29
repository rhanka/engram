/**
 * Build-time scene LAYOUT SELECTION (display Lot-1).
 *
 * The studio export bakes node positions into `scene.json` so the SPA renders a
 * settled layout instantly (no client-side O(n²) sim). This module chooses WHICH
 * layout produces those baked positions — WITHOUT touching the renderer, camera,
 * or shaders. A "variant" is just a different positions set, pinned (`fx`/`fy`)
 * the same way the force layout already is.
 *
 * Two layouts:
 *   • `"force"`       — the DEFAULT. Delegates to {@link attachLayoutPositions}
 *                       (deterministic Barnes-Hut FA2). UNCHANGED behaviour: when
 *                       force is selected nothing here runs and the scene is
 *                       BYTE-IDENTICAL to before (no `layout_id` stamped).
 *   • `"typed-layer"` — Variant A swimlane (OPT-IN). Bands nodes into horizontal
 *                       lanes by `type`, pins the positions, and stamps the
 *                       shared scene contract `layout_id: "typed-layer"` +
 *                       `layout_dims: 2` (#234).
 *
 * SELECTION (opt-in; default stays force):
 *   • env `GRAPHIFY_LAYOUT=typed-layer` — mirrors the existing `GRAPHIFY_FAST_LAYOUT`
 *     opt-in style; read by {@link resolveSceneLayoutId} on the export path; OR
 *   • call {@link applySceneLayout}(scene, "typed-layer") directly with an
 *     explicit id (e.g. from a programmatic build).
 * Anything other than `"typed-layer"` (including unset) ⇒ `"force"`.
 */

// Vendored locally (see typed-layer-layout.ts): the published
// `@sentropic/graph@^0.1.0` graphify depends on at RUNTIME does NOT export
// `computeTypedLayerPositions`, so importing it from the package crashes the
// installed CLI at load (smoke-test regression from #238).
import { computeTypedLayerPositions } from "./typed-layer-layout.js";
import type { TypedLayerLayoutOptions } from "./typed-layer-layout.js";

import { attachLayoutPositions } from "./graph-layout.js";

/** Selectable build-time layout ids. `"force"` is the default. */
export type SceneLayoutId = "force" | "typed-layer";

/** Shared scene-contract layout id stamped when typed-layer is selected (#234). */
export const TYPED_LAYER_SCENE_LAYOUT_ID = "typed-layer";

/** A scene node that can be positioned + pinned (loose, build-time shape). */
interface LayoutableSceneNode {
  id: string;
  type?: unknown;
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
}

/**
 * A scene whose nodes can be positioned + pinned. A minimal STRUCTURAL supertype
 * the studio scene (and the FA2 {@link attachLayoutPositions} input) satisfies —
 * no index signature, so `StudioScene` is assignable as-is.
 */
interface LayoutableScene {
  nodes: LayoutableSceneNode[];
  edges: Array<{ source: string; target: string }>;
  layout_id?: string;
  layout_dims?: 2 | 3;
}

/**
 * Resolve the build-time layout id. Explicit arg wins; otherwise read env
 * `GRAPHIFY_LAYOUT`. Only `"typed-layer"` opts in — everything else (including
 * unset) resolves to `"force"`, so the DEFAULT is never changed.
 */
export function resolveSceneLayoutId(explicit?: string): SceneLayoutId {
  const raw =
    explicit ??
    (typeof process !== "undefined" && process.env ? process.env.GRAPHIFY_LAYOUT : undefined);
  const value = String(raw ?? "").trim().toLowerCase();
  return value === "typed-layer" ? "typed-layer" : "force";
}

/**
 * Variant A wiring — compute typed-layer (swimlane) positions from each scene
 * node's `type`, PIN them (`x`/`y` AND `fx`/`fy`, like the force layout), and
 * stamp the shared scene contract `layout_id` / `layout_dims = 2`. Mutates and
 * returns the scene. Pure O(n); no renderer change.
 */
export function attachTypedLayerPositions<T extends LayoutableScene>(
  scene: T,
  options: TypedLayerLayoutOptions = {},
): T {
  if (!scene || !Array.isArray(scene.nodes) || scene.nodes.length === 0) return scene;

  const nodeTypes = scene.nodes.map((node) =>
    typeof node.type === "string" && node.type.trim() !== "" ? node.type : null,
  );
  const positions = computeTypedLayerPositions(nodeTypes, options);

  for (let i = 0; i < scene.nodes.length; i++) {
    const node = scene.nodes[i];
    if (!node) continue;
    const x = positions[i * 2] ?? 0;
    const y = positions[i * 2 + 1] ?? 0;
    node.x = x;
    node.y = y;
    node.fx = x;
    node.fy = y;
  }

  // Shared scene contract (#234): stamp the layout identity these positions came
  // from. The force/default path deliberately stamps NOTHING (byte-identity).
  scene.layout_id = TYPED_LAYER_SCENE_LAYOUT_ID;
  scene.layout_dims = 2;
  return scene;
}

/**
 * Apply the selected build-time layout to a scene and return it.
 *
 *   • `"force"` (default) → {@link attachLayoutPositions} (FA2), UNCHANGED — no
 *     `layout_id` stamped, byte-identical to the pre-Lot-1 export.
 *   • `"typed-layer"`     → {@link attachTypedLayerPositions} (Variant A).
 */
export function applySceneLayout<T extends LayoutableScene>(
  scene: T,
  layoutId: SceneLayoutId = "force",
): T {
  if (layoutId === "typed-layer") {
    return attachTypedLayerPositions(scene);
  }
  return attachLayoutPositions(scene);
}
