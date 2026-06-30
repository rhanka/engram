/**
 * Pluggable LAYOUT REGISTRY (display Lot-1).
 *
 * A layout maps a graph → node-order-keyed 2D positions: a `Float32Array` of
 * `2 * nodeCount` floats `[x0, y0, x1, y1, …]`, the EXACT shape
 * `GraphRenderer.setPositions` / `RenderGraphBuffers.positions` expects. Layout
 * stays PRECOMPUTED off the render path and baked as positions — this registry
 * only chooses WHICH positions are produced; it never touches the renderer,
 * camera, or shaders (raw-WebGL2 instanced draw path is unchanged).
 *
 * Three layouts ship registered:
 *   • `"force"`         — the DEFAULT. Passthrough of the already-baked positions
 *                         (the deterministic Barnes-Hut FA2 force layout runs OFF
 *                         this path — `src/graph-layout.ts` — and is pinned into
 *                         `graph.positions`; this engine returns them verbatim).
 *   • `"typed-layer"`   — Variant A swimlane: deterministic O(n) banding by node
 *                         type. OPT-IN; never the default.
 *   • `"time-oriented"` — Variant E: deterministic O(n) placement of nodes by
 *                         their interval-start `t` on the X (time) axis (oldest
 *                         left → newest right), banded into type lanes on Y.
 *                         OPT-IN; never the default.
 *
 * The registry honors the existing {@link LayoutEngine} / {@link LayoutOptions}
 * contract: {@link createLayoutEngine} wraps any registered layout as the
 * streaming `LayoutEngine` (a single static frame), so a registered layout plugs
 * straight into the existing engine consumer path.
 */

import { copyPositions, createPositionFrame } from "./positions";
import type { LayoutEngine, LayoutOptions, PositionFrame, RenderGraphBuffers } from "./types";

/**
 * A layout function: graph (+ options) → node-order-keyed 2D positions
 * (`2 * nodeCount` floats). The returned array is exactly what
 * {@link GraphRenderer.setPositions} consumes — no renderer change required.
 */
export type LayoutFn = (graph: RenderGraphBuffers, options?: LayoutOptions) => Float32Array;

/** Registered id of the DEFAULT layout (the baked FA2 force positions). */
export const DEFAULT_LAYOUT_ID = "force";

/** Registered id of Variant A — the typed-layer / swimlane layout. */
export const TYPED_LAYER_LAYOUT_ID = "typed-layer";

/** Registered id of Variant E — the time-oriented (temporal X-axis) layout. */
export const TIME_ORIENTED_LAYOUT_ID = "time-oriented";

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const registry = new Map<string, LayoutFn>();

/** Register (or replace) a layout under `id`. */
export function registerLayout(id: string, fn: LayoutFn): void {
  if (typeof id !== "string" || id.trim() === "") {
    throw new TypeError("layout id must be a non-empty string");
  }
  if (typeof fn !== "function") {
    throw new TypeError(`layout "${id}" must be a function`);
  }
  registry.set(id, fn);
}

/** Look up a registered layout, or `undefined` when unknown. */
export function getLayout(id: string): LayoutFn | undefined {
  return registry.get(id);
}

/** True iff a layout is registered under `id`. */
export function hasLayout(id: string): boolean {
  return registry.has(id);
}

/** Ids of every registered layout (insertion order). */
export function listLayouts(): string[] {
  return [...registry.keys()];
}

/**
 * Resolve a layout, falling back to the DEFAULT when `id` is omitted or unknown.
 * Never throws — an unknown id degrades to the default force passthrough so a
 * stale `layout_id` can never break rendering.
 */
export function resolveLayout(id?: string): LayoutFn {
  if (id !== undefined) {
    const found = registry.get(id);
    if (found) return found;
  }
  // The default is always registered at module load (see bottom of file).
  return registry.get(DEFAULT_LAYOUT_ID) as LayoutFn;
}

/**
 * Wrap a registered layout as the existing streaming {@link LayoutEngine}: it
 * yields ONE static {@link PositionFrame} (`alpha: 0, tick: 0`) carrying the
 * computed positions, so a registry layout drops into any `LayoutEngine`
 * consumer unchanged.
 */
export function createLayoutEngine(id: string = DEFAULT_LAYOUT_ID): LayoutEngine {
  const fn = resolveLayout(id);
  return {
    *run(graph: RenderGraphBuffers, options?: LayoutOptions): Iterable<PositionFrame> {
      yield createPositionFrame(fn(graph, options), { alpha: 0, tick: 0 });
    },
  };
}

// ---------------------------------------------------------------------------
// Built-in: the DEFAULT force layout (passthrough of baked positions).
// ---------------------------------------------------------------------------

/**
 * DEFAULT layout. The FA2 force layout is precomputed off the render path and
 * pinned into `graph.positions`; this passthrough returns a copy of them in the
 * shape `setPositions` expects. Reuses {@link copyPositions} (validates the
 * even length and node-count).
 */
export const forceLayout: LayoutFn = (graph) =>
  copyPositions(graph.positions, graph.nodeIds.length);

// ---------------------------------------------------------------------------
// Variant A — typed-layer / swimlane layout (deterministic, O(n)).
// ---------------------------------------------------------------------------

/** Tuning for {@link computeTypedLayerPositions}. */
export interface TypedLayerLayoutOptions {
  /** Vertical distance between adjacent lane CENTRES (default 120). */
  laneGap?: number;
  /** Horizontal distance between adjacent nodes WITHIN a lane (default 40). */
  nodeGap?: number;
  /**
   * Explicit lane ordering (top→bottom) by type name. Types present in the
   * graph but absent here are appended in ascending (alpha) order; the untyped
   * lane is always placed last. Default: all lanes alpha-sorted.
   */
  laneOrder?: readonly string[];
}

const DEFAULT_LANE_GAP = 120;
const DEFAULT_NODE_GAP = 40;

function normalizeType(raw: string | null | undefined): string | null {
  return typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;
}

/**
 * Deterministic lane ordering shared by the banded layouts: keys named in
 * `explicit` (and actually present) come first in that order, then every
 * remaining present key ascending (alpha). Pure; never mutates its inputs.
 */
function orderLaneKeys(present: readonly string[], explicit?: readonly string[]): string[] {
  const presentSet = new Set(present);
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const key of explicit ?? []) {
    if (presentSet.has(key) && !seen.has(key)) {
      ordered.push(key);
      seen.add(key);
    }
  }
  for (const key of present.filter((k) => !seen.has(k)).sort()) ordered.push(key);
  return ordered;
}

/**
 * Variant A core — place nodes in horizontal bands ("swimlanes") by type.
 *
 *   • one lane per distinct `node_type`; lanes ordered deterministically
 *     (`laneOrder` first, then ascending alpha; the untyped lane last);
 *   • y = the lane CENTRE → every node of a type shares one y-band, and adjacent
 *     bands are separated by `laneGap`;
 *   • x = a stable even spread within the lane, centred on 0, in node order.
 *
 * Pure, deterministic, O(n) (+ O(L log L) to sort the L ≤ n lanes). Returns a
 * fresh node-order-keyed `Float32Array` of length `2 * nodeTypes.length`.
 *
 * @param nodeTypes per-node type label, node-order keyed (parallel to node ids).
 *                  A nullish / blank entry lands in the untyped lane.
 */
export function computeTypedLayerPositions(
  nodeTypes: readonly (string | null | undefined)[],
  options: TypedLayerLayoutOptions = {},
): Float32Array {
  const n = nodeTypes.length;
  const out = new Float32Array(n * 2);
  if (n === 0) return out;

  const laneGap = options.laneGap ?? DEFAULT_LANE_GAP;
  const nodeGap = options.nodeGap ?? DEFAULT_NODE_GAP;

  // Bucket node indices by type, preserving node order within each lane.
  const buckets = new Map<string, number[]>();
  const untyped: number[] = [];
  for (let i = 0; i < n; i++) {
    const type = normalizeType(nodeTypes[i]);
    if (type === null) {
      untyped.push(i);
      continue;
    }
    let arr = buckets.get(type);
    if (!arr) {
      arr = [];
      buckets.set(type, arr);
    }
    arr.push(i);
  }

  // Deterministic lane order: explicit laneOrder (present ones) → remaining
  // defined types ascending → untyped lane last.
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const type of options.laneOrder ?? []) {
    if (buckets.has(type) && !seen.has(type)) {
      ordered.push(type);
      seen.add(type);
    }
  }
  for (const type of [...buckets.keys()].filter((t) => !seen.has(t)).sort()) {
    ordered.push(type);
  }

  const lanes: number[][] = ordered.map((type) => buckets.get(type) as number[]);
  if (untyped.length > 0) lanes.push(untyped);

  const laneCount = lanes.length;
  for (let lane = 0; lane < laneCount; lane++) {
    // Centre the stack of lanes vertically around y = 0.
    const y = (lane - (laneCount - 1) / 2) * laneGap;
    const indices = lanes[lane] as number[];
    const k = indices.length;
    for (let j = 0; j < k; j++) {
      // Centre the row of nodes horizontally around x = 0.
      const x = (j - (k - 1) / 2) * nodeGap;
      const idx = indices[j] as number;
      out[idx * 2] = x;
      out[idx * 2 + 1] = y;
    }
  }

  return out;
}

/**
 * Variant A as a {@link LayoutFn}. Reads per-node types from
 * {@link LayoutOptions.nodeTypes} (node-order keyed); when absent every node is
 * untyped → a single lane. Length always matches `graph.nodeIds.length`.
 */
export const typedLayerLayout: LayoutFn = (graph, options) => {
  const n = graph.nodeIds.length;
  const types = options?.nodeTypes;
  const nodeTypes: (string | null)[] = new Array(n);
  for (let i = 0; i < n; i++) {
    nodeTypes[i] = normalizeType(types?.[i]);
  }
  return computeTypedLayerPositions(nodeTypes);
};

// ---------------------------------------------------------------------------
// Variant E — time-oriented layout (deterministic, O(n)). X = normalized time.
// ---------------------------------------------------------------------------

/** Which per-node attribute drives the PRIMARY horizontal lane on Y. */
export type TimeOrientedLaneBy = "node_type" | "repo";

/** Which per-node attribute sub-bands a primary lane into closely-spaced sub-lines. */
export type TimeOrientedSubLaneBy = "node_type";

/** Tuning for {@link computeTimeOrientedPositions}. */
export interface TimeOrientedLayoutOptions {
  /**
   * Total WIDTH of the time axis. Timed nodes spread across `[-width/2, +width/2]`
   * (centred on x = 0, like Variant A), oldest `t` at the left edge, newest at the
   * right. Default 1000.
   */
  width?: number;
  /** Vertical distance between adjacent PRIMARY-lane CENTRES (default 120). */
  laneGap?: number;
  /**
   * Explicit PRIMARY lane ordering (top→bottom) by lane key. Keys present but
   * absent here are appended ascending (alpha); the unkeyed lane is always last.
   * With `laneBy: "node_type"` the keys are type names (Variant-A semantics); with
   * `laneBy: "repo"` they are repo/project lane keys (see {@link deriveRepoLaneKeys}).
   * Default: all lanes alpha-sorted.
   */
  laneOrder?: readonly string[];
  /**
   * Horizontal gap LEFT of the timeline where UNTIMED nodes are parked. An
   * untimed node (nullish / non-finite `t`) gets a deterministic x =
   * `-width/2 - untimedGap`, sitting on a "park rail" just left of the oldest
   * timed node, while keeping its lane on Y. Default 80.
   */
  untimedGap?: number;
  /**
   * Which per-node attribute drives the PRIMARY Y lane:
   *   • `"node_type"` (DEFAULT) — band by `nodeTypes` (the Variant-A type lanes);
   *     byte-identical to the historical behaviour.
   *   • `"repo"` — band by `nodeLanes` (each node's owning REPO/PROJECT), so one
   *     horizontal lane per project/repo. Intra-repo nodes stay together (loops are
   *     local) and inter-repo edges span lanes. Requires `nodeLanes`; when it is
   *     absent every node lands in the single unkeyed lane.
   */
  laneBy?: TimeOrientedLaneBy;
  /**
   * Per-node PRIMARY lane key (the owning repo/project id), node-order keyed
   * (parallel to `nodeTimes`). Consumed ONLY when `laneBy === "repo"`. Derive it
   * from the graph topology with {@link deriveRepoLaneKeys}. A nullish / blank
   * entry lands in the unkeyed (parked) lane.
   */
  nodeLanes?: readonly (string | null | undefined)[];
  /**
   * When `"node_type"`, each PRIMARY lane is split into closely-spaced SUB-lines
   * by `nodeTypes` — a thin stack of the 6 types inside one project/repo lane. The
   * same type sits at the SAME sub-offset in every primary lane (a global sub-order)
   * so the sub-lines read across lanes. Off by default (one row per primary lane).
   */
  subLaneBy?: TimeOrientedSubLaneBy;
  /**
   * Vertical distance between adjacent SUB-lane centres within a primary lane.
   * Default `laneGap / 8` — intentionally tight so the sub-stack reads as one band
   * and (for the default `laneGap`) never overlaps the neighbouring primary lane.
   */
  subLaneGap?: number;
}

const DEFAULT_TIME_WIDTH = 1000;
const DEFAULT_UNTIMED_GAP = 80;

function finiteTime(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Variant E core — place nodes on a horizontal TIME axis.
 *
 *   • x = the node's interval-start `t`, NORMALIZED across the timed range
 *     `[tMin, tMax]` into `[-width/2, +width/2]` (oldest left → newest right).
 *     When every timed node shares one instant (tMax === tMin) they sit at x = 0.
 *     UNTIMED nodes (nullish / non-finite `t`) are parked deterministically at
 *     x = `-width/2 - untimedGap`, just left of the timeline.
 *   • y = a PRIMARY lane centre, ordered deterministically (`laneOrder` first,
 *     then ascending alpha; the unkeyed lane last). The lane key is chosen by
 *     `laneBy`:
 *       – `"node_type"` (DEFAULT) → one band per distinct `nodeTypes` value, a
 *         temporal swimlane exactly like Variant A. With no `nodeTypes` every node
 *         shares one lane (y = 0). BYTE-IDENTICAL to the historical behaviour.
 *       – `"repo"` → one band per `nodeLanes` value (the owning repo/project), so
 *         intra-repo nodes share a band (loops stay local) and inter-repo edges
 *         span bands.
 *     When `subLaneBy === "node_type"` each primary lane is additionally split into
 *     closely-spaced SUB-lines by `nodeTypes` (a thin 6-type stack inside the lane);
 *     a global sub-order keeps a given type at the same sub-offset across lanes.
 *
 * Pure, deterministic, O(n) (+ O(L log L) to sort the L ≤ n lanes). Returns a
 * fresh node-order-keyed `Float32Array` of length `2 * nodeTimes.length`.
 *
 * @param nodeTimes per-node interval start (epoch-ms), node-order keyed. A
 *                  nullish / non-finite entry is "untimed".
 * @param nodeTypes optional per-node type, node-order keyed (parallel). Drives the
 *                  type lanes (`laneBy: "node_type"`) and/or the type sub-lanes
 *                  (`subLaneBy: "node_type"`). Absent ⇒ one lane (y = 0).
 */
export function computeTimeOrientedPositions(
  nodeTimes: readonly (number | null | undefined)[],
  nodeTypes?: readonly (string | null | undefined)[],
  options: TimeOrientedLayoutOptions = {},
): Float32Array {
  const n = nodeTimes.length;
  const out = new Float32Array(n * 2);
  if (n === 0) return out;

  const width = options.width ?? DEFAULT_TIME_WIDTH;
  const laneGap = options.laneGap ?? DEFAULT_LANE_GAP;
  const untimedGap = options.untimedGap ?? DEFAULT_UNTIMED_GAP;
  const halfWidth = width / 2;

  // --- X: normalize timed nodes; park untimed ones on a deterministic rail. ---
  let tMin = Number.POSITIVE_INFINITY;
  let tMax = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < n; i++) {
    const t = nodeTimes[i];
    if (!finiteTime(t)) continue;
    if (t < tMin) tMin = t;
    if (t > tMax) tMax = t;
  }
  const span = tMax - tMin;
  const untimedX = -halfWidth - untimedGap;
  for (let i = 0; i < n; i++) {
    const t = nodeTimes[i];
    if (!finiteTime(t)) {
      out[i * 2] = untimedX;
      continue;
    }
    // span === 0 ⇒ every timed node shares one instant ⇒ centre them at x = 0.
    const frac = span > 0 ? (t - tMin) / span : 0.5;
    out[i * 2] = (frac - 0.5) * width;
  }

  // --- Y: PRIMARY lanes (by type OR repo) + optional type SUB-lanes. ---
  const laneBy: TimeOrientedLaneBy = options.laneBy ?? "node_type";
  const subLaneBy = options.subLaneBy;
  const subLaneGap = options.subLaneGap ?? laneGap / 8;

  // PRIMARY lane key per node: the owning repo (laneBy "repo") or the type.
  const primaryKeyOf = (i: number): string | null =>
    laneBy === "repo" ? normalizeType(options.nodeLanes?.[i]) : normalizeType(nodeTypes?.[i]);

  // Bucket node indices by primary key, preserving node order within each lane.
  const buckets = new Map<string, number[]>();
  const unkeyed: number[] = [];
  for (let i = 0; i < n; i++) {
    const key = primaryKeyOf(i);
    if (key === null) {
      unkeyed.push(i);
      continue;
    }
    let arr = buckets.get(key);
    if (!arr) {
      arr = [];
      buckets.set(key, arr);
    }
    arr.push(i);
  }
  const ordered = orderLaneKeys([...buckets.keys()], options.laneOrder);
  const lanes: number[][] = ordered.map((key) => buckets.get(key) as number[]);
  if (unkeyed.length > 0) lanes.push(unkeyed);
  const laneCount = lanes.length;

  // GLOBAL type sub-lane order, so a given type sits at the SAME sub-offset in
  // every primary lane (the sub-lines read across lanes). Built once over all
  // nodes; an untyped sub-lane (if any) sorts last. Empty when sub-lanes are off.
  let subOffsetOf: (i: number) => number = () => 0;
  if (subLaneBy === "node_type") {
    const presentTypes = new Set<string>();
    let hasUntypedSub = false;
    for (let i = 0; i < n; i++) {
      const type = normalizeType(nodeTypes?.[i]);
      if (type === null) hasUntypedSub = true;
      else presentTypes.add(type);
    }
    const subOrder = orderLaneKeys([...presentTypes]);
    const subIndex = new Map<string, number>();
    subOrder.forEach((type, idx) => subIndex.set(type, idx));
    const untypedSubIdx = subOrder.length; // untyped sub-lane after the named ones
    const subCount = subOrder.length + (hasUntypedSub ? 1 : 0);
    subOffsetOf = (i: number): number => {
      const type = normalizeType(nodeTypes?.[i]);
      const idx = type === null ? untypedSubIdx : (subIndex.get(type) ?? untypedSubIdx);
      return (idx - (subCount - 1) / 2) * subLaneGap;
    };
  }

  for (let lane = 0; lane < laneCount; lane++) {
    // Centre the stack of primary lanes vertically around y = 0 (single lane ⇒ 0).
    const laneY = (lane - (laneCount - 1) / 2) * laneGap;
    for (const idx of lanes[lane] as number[]) {
      out[idx * 2 + 1] = laneY + subOffsetOf(idx);
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Repo/project lane derivation — pure graph topology → per-node lane key.
// ---------------------------------------------------------------------------

/** Minimal node shape {@link deriveRepoLaneKeys} reads (id + `node_type`). */
export interface RepoLaneNode {
  id: string;
  /** The node's type (`node_type` / scene `type`); compared case-insensitively. */
  type?: string | null;
}

/** Minimal directed edge shape {@link deriveRepoLaneKeys} reads. */
export interface RepoLaneEdge {
  source: string;
  target: string;
}

/** Result of {@link deriveRepoLaneKeys}: per-node lane key + a suggested order. */
export interface RepoLaneResult {
  /**
   * Per-node PRIMARY lane key, parallel to the input `nodes`. A Repo/Project node
   * keys to its OWN id; an Agent keys to {@link AGENT_LANE_KEY}; a
   * Session/Branch/Commit inherits the repo it reaches first; anything unresolved
   * is `null` (parked / unkeyed lane). Feed straight to `nodeLanes`.
   */
  laneKeys: (string | null)[];
  /**
   * Suggested top→bottom PRIMARY lane order for `laneOrder`: repos in graph order
   * (the rename-lineage / chronological order), then project lanes, then the
   * single agents lane. Stable + deterministic.
   */
  laneOrder: string[];
}

/** Lane key that GROUPS every Agent node into one shared lane. */
export const AGENT_LANE_KEY = "__agents__";

const REPO_TYPE = "repo";
const PROJECT_TYPE = "project";
const AGENT_TYPE = "agent";

/**
 * Derive each node's owning REPO/PROJECT lane key from graph topology — the data
 * `computeTimeOrientedPositions` needs for `laneBy: "repo"`.
 *
 * Rules (the agent-stats project-graph shape, but generic):
 *   • a `Repo`/`Project` node keys to its OWN id (its own lane);
 *   • every `Agent` node groups into one {@link AGENT_LANE_KEY} lane (agents span
 *     repos — keeping them in one lane makes their cross-repo edges read as
 *     lane-spanning rather than polluting a repo lane);
 *   • a `Session`/`Branch`/`Commit` (anything else) INHERITS a repo by a
 *     multi-source BFS seeded from every Repo node, over an adjacency that EXCLUDES
 *     Project + Agent nodes (the cross-repo hubs) so a repo cannot leak through the
 *     shared project/agent into another repo. Sessions sit one hop from their
 *     `worked-in` repo; branches/commits two hops via the session that
 *     touched/produced them. Ties (e.g. a branch shared across rename incarnations)
 *     resolve to the earliest repo in graph order — deterministic — and the losing
 *     repo's edge to it then reads as a cross-lane (inter-incarnation) link.
 *   • unresolved nodes stay `null` (the parked / unkeyed lane).
 *
 * Pure & deterministic: O(V + E). Never mutates its inputs.
 */
export function deriveRepoLaneKeys(
  nodes: readonly RepoLaneNode[],
  edges: readonly RepoLaneEdge[],
): RepoLaneResult {
  const n = nodes.length;
  const laneKeys: (string | null)[] = new Array(n).fill(null);
  const laneOrder: string[] = [];
  if (n === 0) return { laneKeys, laneOrder };

  const idToIndex = new Map<string, number>();
  for (let i = 0; i < n; i++) idToIndex.set(nodes[i]!.id, i);

  const typeOf = (i: number): string => {
    const t = nodes[i]?.type;
    return typeof t === "string" ? t.trim().toLowerCase() : "";
  };
  const isRepo = (i: number) => typeOf(i) === REPO_TYPE;
  const isProject = (i: number) => typeOf(i) === PROJECT_TYPE;
  const isAgent = (i: number) => typeOf(i) === AGENT_TYPE;
  const isHub = (i: number) => isProject(i) || isAgent(i);

  // Seed special lanes + collect the deterministic lane order.
  const repoOrder: string[] = [];
  const projectKeys: string[] = [];
  let hasAgent = false;
  for (let i = 0; i < n; i++) {
    if (isRepo(i)) {
      laneKeys[i] = nodes[i]!.id;
      repoOrder.push(nodes[i]!.id);
    } else if (isProject(i)) {
      laneKeys[i] = nodes[i]!.id;
      projectKeys.push(nodes[i]!.id);
    } else if (isAgent(i)) {
      laneKeys[i] = AGENT_LANE_KEY;
      hasAgent = true;
    }
  }

  // Adjacency EXCLUDING Project + Agent nodes (cross-repo hubs).
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const e of edges) {
    const a = idToIndex.get(e.source);
    const b = idToIndex.get(e.target);
    if (a === undefined || b === undefined) continue;
    if (isHub(a) || isHub(b)) continue;
    adj[a]!.push(b);
    adj[b]!.push(a);
  }

  // Multi-source BFS from the Repo seeds, enqueued in graph order so equal-distance
  // ties resolve to the earlier repo.
  const repoOf: (string | null)[] = new Array(n).fill(null);
  const queue: number[] = [];
  for (let i = 0; i < n; i++) {
    if (isRepo(i)) {
      repoOf[i] = nodes[i]!.id;
      queue.push(i);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const u = queue[head]!;
    const repo = repoOf[u]!;
    for (const v of adj[u]!) {
      if (repoOf[v] === null && !isRepo(v) && !isHub(v)) {
        repoOf[v] = repo;
        queue.push(v);
      }
    }
  }
  for (let i = 0; i < n; i++) {
    const r = repoOf[i];
    if (laneKeys[i] === null && r != null) laneKeys[i] = r;
  }

  laneOrder.push(...repoOrder, ...projectKeys);
  if (hasAgent) laneOrder.push(AGENT_LANE_KEY);
  return { laneKeys, laneOrder };
}

/**
 * Variant E as a {@link LayoutFn}. Reads per-node start times from
 * {@link LayoutOptions.nodeTimes} and optional types from
 * {@link LayoutOptions.nodeTypes} (both node-order keyed), and forwards the
 * lane controls (`laneBy` / `nodeLanes` / `subLaneBy`) when present so a caller
 * can drive repo lanes + type sub-lanes through the registry too. Absent times ⇒
 * every node untimed (all parked on the left rail); absent types ⇒ one lane.
 * Length always matches `graph.nodeIds.length`.
 */
export const timeOrientedLayout: LayoutFn = (graph, options) => {
  const n = graph.nodeIds.length;
  const times = options?.nodeTimes;
  const nodeTimes: (number | null)[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = times?.[i];
    nodeTimes[i] = finiteTime(t) ? t : null;
  }
  const opts: TimeOrientedLayoutOptions = {};
  if (options?.laneBy !== undefined) opts.laneBy = options.laneBy;
  if (options?.nodeLanes !== undefined) opts.nodeLanes = options.nodeLanes;
  if (options?.subLaneBy !== undefined) opts.subLaneBy = options.subLaneBy;
  return computeTimeOrientedPositions(nodeTimes, options?.nodeTypes, opts);
};

// ---------------------------------------------------------------------------
// Register built-ins at module load. The DEFAULT (`"force"`) MUST stay the
// passthrough — typed-layer / time-oriented are strictly opt-in and never
// replace it.
// ---------------------------------------------------------------------------

registerLayout(DEFAULT_LAYOUT_ID, forceLayout);
registerLayout(TYPED_LAYER_LAYOUT_ID, typedLayerLayout);
registerLayout(TIME_ORIENTED_LAYOUT_ID, timeOrientedLayout);
