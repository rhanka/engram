/**
 * `hierarchy-aware` — a deterministic, SIMULATION-FREE build-time layout that
 * makes a corpus's declared hierarchies legible.
 *
 * WHY: the force (FA2) bake is O(n log n) per iteration but structure-blind. On
 * a 50k-node corpus whose real skeleton is three registry forests it settles
 * into a uniform dense disc: every hierarchy is smeared across the same blob and
 * nothing about ABP-vs-process-std-vs-org survives. Meanwhile `typed-layer` on a large
 * hierarchical corpus degenerates into a filament (one thin lane per type). This
 * layout uses the hierarchy the profile ALREADY declares instead of rediscovering
 * it, and does so in a single deterministic pass:
 *
 *   - NO simulation, NO iteration count, NO pairwise repulsion ⇒ strictly O(n)
 *     in time and O(n) in memory. It cannot OOM and it cannot "not converge".
 *   - Deterministic: identical inputs ⇒ identical positions, bit for bit. All
 *     ordering is by explicit stable sort on ids, never on Map/object order.
 *
 * SHAPE — clusters on a deterministic grid:
 *
 *   1. Every hierarchy becomes one RADIAL TIDY TREE cluster. Its roots hang off
 *      a virtual super-root at the cluster centre; depth maps to ring radius and
 *      each subtree gets an angular wedge proportional to its LEAF COUNT (the
 *      classic radial tidy-tree allocation), so siblings never overlap and
 *      dense branches get the room they need. Two passes: leaf counts up, then
 *      wedges down.
 *   2. Every node NOT in any hierarchy is grouped by `type` into its own
 *      cluster, laid out as a phyllotaxis (sunflower) disc — uniform density,
 *      no gaps, no sort, O(1) per node.
 *   3. Clusters are packed largest-first into a square-ish grid, each cell
 *      sized by sqrt(cluster size) so a 2282-node forest gets ~7x the radius of
 *      a 47-node one. Hierarchy clusters sort before type clusters, so the
 *      declared structure lands top-left where the camera opens.
 *
 * The result reads as separated, individually-legible structures rather than
 * one disc. Positions are PINNED (`x`/`y` AND `fx`/`fy`) exactly like the force
 * and typed-layer bakes, so a client that honours pins keeps them.
 *
 * This module is PURE (no I/O). The wiring + id/env selection lives in
 * `scene-layout.ts`.
 */

/** Minimal per-hierarchy shape this layout needs (a `SceneHierarchy` subset). */
export interface HierarchyLayoutForest {
  root_ids: string[];
  nodes_by_id: Record<string, { parent_id: string | null; child_ids: string[] }>;
}

/** A node this layout can place. */
export interface HierarchyLayoutNode {
  id: string;
  type?: unknown;
  /** Raw registry id — the key the hierarchy forests are expressed in (D2). */
  registry_record_id?: unknown;
}

export interface HierarchyAwareLayoutOptions {
  /**
   * Spacing between consecutive depth rings of a tidy tree, in scene units.
   * Cluster radius is roughly `depth * ringGap`.
   */
  ringGap?: number;
  /** Gap between neighbouring cluster cells, as a fraction of cell size. */
  clusterPadding?: number;
  /** Scene units per sqrt(node) used to size a cluster cell. */
  clusterScale?: number;
}

const DEFAULTS = {
  ringGap: 130,
  clusterPadding: 0.22,
  clusterScale: 46,
} as const;

/** Result of a layout pass: a flat [x0,y0,x1,y1,...] buffer + diagnostics. */
export interface HierarchyAwareLayoutResult {
  /** `positions[i*2]` / `positions[i*2+1]` for input node `i`. */
  positions: Float64Array;
  /** Number of clusters laid out (hierarchy forests + type groups). */
  clusterCount: number;
  /** Nodes placed by a tidy tree (i.e. matched into a declared hierarchy). */
  hierarchyNodeCount: number;
  /** Nodes placed on a phyllotaxis disc (no hierarchy membership). */
  looseNodeCount: number;
  /** Deepest level reached across all forests. */
  maxDepth: number;
}

interface Cluster {
  /** Sort key — deterministic and unique. */
  key: string;
  /** Hierarchy clusters sort before loose type clusters. */
  rank: 0 | 1;
  /** Indices into the caller's node array. */
  members: number[];
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function rawIdOf(node: HierarchyLayoutNode): string {
  return typeof node.registry_record_id === "string" && node.registry_record_id
    ? node.registry_record_id
    : node.id;
}

function typeOf(node: HierarchyLayoutNode): string {
  return typeof node.type === "string" && node.type.trim() !== ""
    ? node.type
    : "(untyped)";
}

/**
 * Radial tidy tree over one forest, relative to (0,0).
 *
 * Pass 1 (iterative post-order) computes a leaf weight per node; pass 2
 * (iterative pre-order) hands each child a wedge of its parent's angular span
 * proportional to that weight. Both passes are explicit-stack — a 5-level,
 * 2030-node forest is shallow, but recursion is avoided so a pathological
 * chain cannot blow the stack.
 *
 * Returns polar placements keyed by raw id, plus the depth reached.
 */
function layoutForest(
  forest: HierarchyLayoutForest,
  present: (rawId: string) => boolean,
  ringGap: number,
): { placements: Map<string, { x: number; y: number }>; depth: number } {
  const placements = new Map<string, { x: number; y: number }>();
  const nodes = forest.nodes_by_id ?? {};

  const childrenOf = (id: string): string[] => {
    const entry = nodes[id];
    if (!entry || !Array.isArray(entry.child_ids)) return [];
    // Only descend into children the forest actually describes; a child_id with
    // no entry is a dangling reference and would otherwise weigh 0 forever.
    return entry.child_ids.filter((child) => nodes[child] !== undefined);
  };

  const roots = [...(forest.root_ids ?? [])]
    .filter((id) => nodes[id] !== undefined)
    .sort(compareStrings);
  if (roots.length === 0) return { placements, depth: 0 };

  // --- Pass 1: leaf weights (post-order, iterative). ---
  const weight = new Map<string, number>();
  for (const root of roots) {
    const stack: Array<{ id: string; expanded: boolean }> = [
      { id: root, expanded: false },
    ];
    const seen = new Set<string>();
    while (stack.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const frame = stack.pop()!;
      if (!frame.expanded) {
        if (seen.has(frame.id)) continue; // defensive: the sidecar is acyclic
        seen.add(frame.id);
        stack.push({ id: frame.id, expanded: true });
        for (const child of childrenOf(frame.id)) {
          stack.push({ id: child, expanded: false });
        }
        continue;
      }
      const children = childrenOf(frame.id);
      if (children.length === 0) {
        weight.set(frame.id, 1);
        continue;
      }
      let total = 0;
      for (const child of children) total += weight.get(child) ?? 1;
      weight.set(frame.id, total);
    }
  }

  // --- Pass 2: wedges (pre-order, iterative). ---
  // The forest's roots share the full circle around the virtual super-root,
  // split by weight, so a heavy root gets a proportionally wider fan.
  let rootTotal = 0;
  for (const root of roots) rootTotal += weight.get(root) ?? 1;
  if (rootTotal <= 0) rootTotal = roots.length;

  let depth = 0;
  const TAU = Math.PI * 2;
  const stack: Array<{ id: string; level: number; start: number; end: number }> = [];
  let cursor = 0;
  for (const root of roots) {
    const span = ((weight.get(root) ?? 1) / rootTotal) * TAU;
    stack.push({ id: root, level: 1, start: cursor, end: cursor + span });
    cursor += span;
  }

  while (stack.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const frame = stack.pop()!;
    const mid = (frame.start + frame.end) / 2;
    const radius = frame.level * ringGap;
    if (frame.level > depth) depth = frame.level;
    if (present(frame.id)) {
      placements.set(frame.id, {
        x: Math.cos(mid) * radius,
        y: Math.sin(mid) * radius,
      });
    }

    const children = childrenOf(frame.id);
    if (children.length === 0) continue;
    let childTotal = 0;
    for (const child of children) childTotal += weight.get(child) ?? 1;
    if (childTotal <= 0) childTotal = children.length;

    // Children fan across the parent's OWN wedge, shrunk slightly so adjacent
    // subtrees keep a visible gutter instead of touching.
    const inset = (frame.end - frame.start) * 0.04;
    let childCursor = frame.start + inset / 2;
    const usable = frame.end - frame.start - inset;
    for (const child of children) {
      const span = ((weight.get(child) ?? 1) / childTotal) * usable;
      stack.push({
        id: child,
        level: frame.level + 1,
        start: childCursor,
        end: childCursor + span,
      });
      childCursor += span;
    }
  }

  return { placements, depth };
}

/**
 * Phyllotaxis (sunflower) disc placement for `count` nodes, relative to (0,0).
 * Uniform density, deterministic, O(1) per node — the right shape for a bag of
 * nodes with no internal structure to express.
 */
function sunflower(index: number, spacing: number): { x: number; y: number } {
  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
  const radius = spacing * Math.sqrt(index + 0.5);
  const angle = index * GOLDEN_ANGLE;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

/**
 * Compute hierarchy-aware positions for `nodes`, using `hierarchies` (the
 * `graphify_scene_hierarchies_v1` forests, keyed by raw registry id) as the
 * structural skeleton.
 *
 * A node joins a forest when its `registry_record_id` (falling back to `id`) is
 * a key of that forest's `nodes_by_id`. A node matching several forests joins
 * the first by sorted hierarchy id, so membership is single-valued and stable.
 */
export function computeHierarchyAwarePositions(
  nodes: readonly HierarchyLayoutNode[],
  hierarchies: Record<string, HierarchyLayoutForest>,
  options: HierarchyAwareLayoutOptions = {},
): HierarchyAwareLayoutResult {
  const ringGap = options.ringGap ?? DEFAULTS.ringGap;
  const clusterPadding = options.clusterPadding ?? DEFAULTS.clusterPadding;
  const clusterScale = options.clusterScale ?? DEFAULTS.clusterScale;

  const positions = new Float64Array(nodes.length * 2);
  if (nodes.length === 0) {
    return {
      positions,
      clusterCount: 0,
      hierarchyNodeCount: 0,
      looseNodeCount: 0,
      maxDepth: 0,
    };
  }

  // Raw id -> node indices. A raw id can legitimately repeat (two scene nodes
  // linked to the same registry record), so every match is placed.
  const indicesByRawId = new Map<string, number[]>();
  for (let i = 0; i < nodes.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const rawId = rawIdOf(nodes[i]!);
    const bucket = indicesByRawId.get(rawId);
    if (bucket) bucket.push(i);
    else indicesByRawId.set(rawId, [i]);
  }

  const hierarchyIds = Object.keys(hierarchies ?? {}).sort(compareStrings);
  const claimed = new Uint8Array(nodes.length);
  const clusters: Cluster[] = [];
  /** Per-cluster local offsets, aligned with `clusters`. */
  const localPositions: Array<Array<{ x: number; y: number }>> = [];
  let maxDepth = 0;
  let hierarchyNodeCount = 0;

  for (const hierarchyId of hierarchyIds) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const forest = hierarchies[hierarchyId]!;
    const { placements, depth } = layoutForest(
      forest,
      (rawId) => indicesByRawId.has(rawId),
      ringGap,
    );
    if (placements.size === 0) continue;
    if (depth > maxDepth) maxDepth = depth;

    const members: number[] = [];
    const local: Array<{ x: number; y: number }> = [];
    // Sorted for determinism: the placement map's insertion order follows the
    // traversal stack, which we do not want leaking into the output.
    for (const rawId of [...placements.keys()].sort(compareStrings)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const point = placements.get(rawId)!;
      for (const index of indicesByRawId.get(rawId) ?? []) {
        if (claimed[index]) continue; // first forest by sorted id wins
        claimed[index] = 1;
        members.push(index);
        local.push(point);
        hierarchyNodeCount += 1;
      }
    }
    if (members.length === 0) continue;
    clusters.push({ key: hierarchyId, rank: 0, members });
    localPositions.push(local);
  }

  // --- Loose nodes: one phyllotaxis cluster per type. ---
  const looseByType = new Map<string, number[]>();
  for (let i = 0; i < nodes.length; i++) {
    if (claimed[i]) continue;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const type = typeOf(nodes[i]!);
    const bucket = looseByType.get(type);
    if (bucket) bucket.push(i);
    else looseByType.set(type, [i]);
  }
  let looseNodeCount = 0;
  for (const type of [...looseByType.keys()].sort(compareStrings)) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const members = looseByType.get(type)!;
    const local = members.map((_, index) => sunflower(index, ringGap * 0.34));
    looseNodeCount += members.length;
    clusters.push({ key: type, rank: 1, members });
    localPositions.push(local);
  }

  if (clusters.length === 0) {
    return {
      positions,
      clusterCount: 0,
      hierarchyNodeCount,
      looseNodeCount,
      maxDepth,
    };
  }

  // --- Pack clusters into a square-ish grid, largest first. ---
  // The order array is sorted rather than the clusters themselves so
  // `localPositions` stays index-aligned.
  const order = clusters.map((_, index) => index);
  order.sort((a, b) => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const left = clusters[a]!;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const right = clusters[b]!;
    return (
      left.rank - right.rank ||
      right.members.length - left.members.length ||
      compareStrings(left.key, right.key)
    );
  });

  const columns = Math.max(1, Math.ceil(Math.sqrt(order.length)));
  // One cell size for the whole grid keeps the packing trivially deterministic;
  // it is driven by the LARGEST cluster so nothing overflows its cell.
  let widest = 0;
  for (const index of order) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const radius = clusterScale * Math.sqrt(clusters[index]!.members.length);
    if (radius > widest) widest = radius;
  }
  const cell = widest * 2 * (1 + clusterPadding);

  for (let slot = 0; slot < order.length; slot++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const clusterIndex = order[slot]!;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const cluster = clusters[clusterIndex]!;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const local = localPositions[clusterIndex]!;
    const column = slot % columns;
    const row = Math.floor(slot / columns);
    const originX = (column - (columns - 1) / 2) * cell;
    const originY = row * cell;
    for (let m = 0; m < cluster.members.length; m++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const nodeIndex = cluster.members[m]!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const point = local[m]!;
      positions[nodeIndex * 2] = originX + point.x;
      positions[nodeIndex * 2 + 1] = originY + point.y;
    }
  }

  return {
    positions,
    clusterCount: clusters.length,
    hierarchyNodeCount,
    looseNodeCount,
    maxDepth,
  };
}
