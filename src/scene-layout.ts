/**
 * Build-time scene LAYOUT SELECTION (display Lot-1).
 *
 * The studio export bakes node positions into `scene.json` so the SPA renders a
 * settled layout instantly (no client-side O(n²) sim). This module chooses WHICH
 * layout produces those baked positions — WITHOUT touching the renderer, camera,
 * or shaders. A "variant" is just a different positions set, pinned (`fx`/`fy`)
 * the same way the force layout already is.
 *
 * Three layouts:
 *   • `"force"`         — the DEFAULT. Delegates to {@link attachLayoutPositions}
 *                         (deterministic Barnes-Hut FA2). UNCHANGED behaviour: when
 *                         force is selected nothing here runs and the scene is
 *                         BYTE-IDENTICAL to before (no `layout_id` stamped).
 *   • `"typed-layer"`   — Variant A swimlane (OPT-IN). Bands nodes into horizontal
 *                         lanes by `type`, pins the positions, and stamps the
 *                         shared scene contract `layout_id: "typed-layer"` +
 *                         `layout_dims: 2` (#234).
 *   • `"time-oriented"` — Variant E (OPT-IN). Places nodes by the shared-contract
 *                         `t` on the X (time) axis (oldest left → newest right),
 *                         banded into `type` lanes on Y; untimed nodes parked on a
 *                         deterministic rail left of the timeline. Pins the
 *                         positions and stamps `layout_id: "time-oriented"` +
 *                         `layout_dims: 2`.
 *
 * For `time-oriented`, two further env knobs (read by
 * {@link resolveTimeOrientedSceneOptions}) shape the Y lanes — `GRAPHIFY_LANE_BY=repo`
 * bands by each node's owning REPO/PROJECT instead of by type (surfacing
 * inter-project edges across lanes + intra-project loops within a lane), and
 * `GRAPHIFY_SUBLANE_BY=node_type` splits each lane into 6 tight type sub-lines.
 * Both unset ⇒ the historical type lanes (byte-identical).
 *
 * SELECTION (opt-in; default stays force):
 *   • env `GRAPHIFY_LAYOUT=typed-layer` | `time-oriented` — mirrors the existing
 *     `GRAPHIFY_FAST_LAYOUT` opt-in style; read by {@link resolveSceneLayoutId}
 *     on the export path; OR
 *   • call {@link applySceneLayout}(scene, "typed-layer" | "time-oriented")
 *     directly with an explicit id (e.g. from a programmatic build).
 * Anything else (including unset) ⇒ `"force"`.
 */

// Vendored locally (see typed-layer-layout.ts): the published
// `@sentropic/graph@^0.1.0` graphify depends on at RUNTIME does NOT export
// `computeTypedLayerPositions` / `computeTimeOrientedPositions`, so importing
// them from the package crashes the installed CLI at load (smoke-test
// regression from #238). The vendored copies are byte-identical to the
// canonical `packages/graph/src/layout-registry.ts` helpers.
import {
  computeTimeOrientedPositions,
  computeTypedLayerPositions,
  deriveRepoLaneKeys,
} from "./typed-layer-layout.js";
import type {
  RepoLaneNode,
  TimeOrientedLayoutOptions,
  TypedLayerLayoutOptions,
} from "./typed-layer-layout.js";

import { attachLayoutPositions } from "./graph-layout.js";

/** Selectable build-time layout ids. `"force"` is the default. */
export type SceneLayoutId = "force" | "typed-layer" | "time-oriented";

/** Shared scene-contract layout id stamped when typed-layer is selected (#234). */
export const TYPED_LAYER_SCENE_LAYOUT_ID = "typed-layer";

/** Shared scene-contract layout id stamped when time-oriented is selected (#234). */
export const TIME_ORIENTED_SCENE_LAYOUT_ID = "time-oriented";

/** A scene node that can be positioned + pinned (loose, build-time shape). */
interface LayoutableSceneNode {
  id: string;
  type?: unknown;
  /** Shared scene contract — interval start, epoch-ms (#234). Read by Variant E. */
  t?: unknown;
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
  if (value === "typed-layer") return "typed-layer";
  if (value === "time-oriented") return "time-oriented";
  return "force";
}

/**
 * Resolve the Variant-E lane controls from the environment (the export path):
 *   • `GRAPHIFY_LANE_BY=repo` (or `project`) → primary lanes by owning repo/project;
 *     `node_type` / `type` → primary lanes by type (the default). Anything else /
 *     unset ⇒ undefined (→ the layout default `node_type`, byte-identical).
 *   • `GRAPHIFY_SUBLANE_BY=node_type` (or `type`) → split each primary lane into
 *     closely-spaced type sub-lines. Unset ⇒ off.
 * Returns only the keys that were explicitly requested, so an unset environment
 * yields `{}` and the historical (type-lane) behaviour is preserved.
 */
export function resolveTimeOrientedSceneOptions(): TimeOrientedLayoutOptions {
  const env = typeof process !== "undefined" && process.env ? process.env : {};
  const laneByRaw = String(env.GRAPHIFY_LANE_BY ?? "").trim().toLowerCase();
  const subRaw = String(env.GRAPHIFY_SUBLANE_BY ?? "").trim().toLowerCase();
  const options: TimeOrientedLayoutOptions = {};
  if (laneByRaw === "repo" || laneByRaw === "project") options.laneBy = "repo";
  else if (laneByRaw === "node_type" || laneByRaw === "type") options.laneBy = "node_type";
  if (subRaw === "node_type" || subRaw === "type") options.subLaneBy = "node_type";
  return options;
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
 * Variant E wiring — compute time-oriented positions from each scene node's
 * shared-contract `t` (the X / time axis) and `type` (Y type-lanes), PIN them
 * (`x`/`y` AND `fx`/`fy`, like the force / typed-layer paths), and stamp the
 * shared scene contract `layout_id` / `layout_dims = 2` (#234). Nodes lacking a
 * finite `t` are parked on the deterministic "untimed" rail left of the
 * timeline. Mutates and returns the scene. Pure O(n); no renderer change.
 */
export function attachTimeOrientedPositions<T extends LayoutableScene>(
  scene: T,
  options: TimeOrientedLayoutOptions = {},
): T {
  if (!scene || !Array.isArray(scene.nodes) || scene.nodes.length === 0) return scene;

  const nodeTimes = scene.nodes.map((node) =>
    typeof node.t === "number" && Number.isFinite(node.t) ? node.t : null,
  );
  const nodeTypes = scene.nodes.map((node) =>
    typeof node.type === "string" && node.type.trim() !== "" ? node.type : null,
  );

  // When laneBy="repo", derive each node's owning repo/project lane from the
  // graph topology (scene nodes + edges) and band PRIMARILY by it; the optional
  // type sub-lanes (subLaneBy) still come from node.type. Default (node_type)
  // skips derivation entirely → byte-identical to the historical behaviour.
  let layoutOptions: TimeOrientedLayoutOptions = options;
  if (options.laneBy === "repo") {
    const laneNodes: RepoLaneNode[] = scene.nodes.map((node) => ({
      id: node.id,
      type: typeof node.type === "string" ? node.type : null,
    }));
    const { laneKeys, laneOrder } = deriveRepoLaneKeys(laneNodes, scene.edges);
    layoutOptions = {
      ...options,
      nodeLanes: laneKeys,
      // Stack repo lanes in graph order unless the caller pinned an order.
      laneOrder: options.laneOrder ?? laneOrder,
    };
  }
  const positions = computeTimeOrientedPositions(nodeTimes, nodeTypes, layoutOptions);

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

  scene.layout_id = TIME_ORIENTED_SCENE_LAYOUT_ID;
  scene.layout_dims = 2;
  return scene;
}

/**
 * Apply the selected build-time layout to a scene and return it.
 *
 *   • `"force"` (default) → {@link attachLayoutPositions} (FA2), UNCHANGED — no
 *     `layout_id` stamped, byte-identical to the pre-Lot-1 export.
 *   • `"typed-layer"`     → {@link attachTypedLayerPositions} (Variant A).
 *   • `"time-oriented"`   → {@link attachTimeOrientedPositions} (Variant E).
 */
export function applySceneLayout<T extends LayoutableScene>(
  scene: T,
  layoutId: SceneLayoutId = "force",
): T {
  if (layoutId === "typed-layer") {
    return attachTypedLayerPositions(scene);
  }
  if (layoutId === "time-oriented") {
    // Honour GRAPHIFY_LANE_BY / GRAPHIFY_SUBLANE_BY on the export path (the call
    // site passes no explicit options); unset ⇒ {} ⇒ type lanes (back-compat).
    return attachTimeOrientedPositions(scene, resolveTimeOrientedSceneOptions());
  }
  return attachLayoutPositions(scene);
}
