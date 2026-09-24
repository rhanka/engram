/**
 * `hierarchy-aware` — a deterministic, SIMULATION-FREE build-time layout that
 * makes a corpus's declared hierarchies legible.
 *
 * WHY: the force (FA2) bake is O(n log n) per iteration but structure-blind. On
 * a 50k-node corpus whose real skeleton is three registry forests it settles
 * into a uniform dense disc: every hierarchy is smeared across the same blob and
 * nothing about ABP-vs-ACLP-vs-org survives. Meanwhile `typed-layer` on a large
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
 *   2. A tree is then scaled by its BUSIEST RING, not by its node count: a ring
 *      holding C nodes needs radius >= C * nodeGap / 2pi for consecutive nodes
 *      to be `nodeGap` apart. Sizing on sqrt(size) alone crushes 2000 leaves
 *      into one ring at ~6 units apart — a solid donut in which no branch is
 *      separable — which is exactly what "hierarchy-aware" is supposed to fix.
 *   3. Every node NOT in any hierarchy is grouped by `type` into its own
 *      cluster, laid out as a phyllotaxis (sunflower) disc — uniform density,
 *      no gaps, no sort, O(1) per node. The disc spacing is the SAME `nodeGap`,
 *      so a tree and a disc read at one density.
 *   4. Clusters are packed largest-first by SHELF (rows of their own true
 *      radius), not into a uniform grid: one cell size for everything is set by
 *      the biggest cluster, so a 470-node forest next to a 12k-node disc lands
 *      as a dot adrift in whitespace. Rows are centred; hierarchy clusters sort
 *      before type clusters, so the declared structure lands top-left where the
 *      camera opens.
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
   * MINIMUM spacing between consecutive depth rings of a tidy tree, in scene
   * units. The effective spacing is normally derived from the forest's size, so
   * a tree fills a footprint comparable to a same-sized disc cluster; this is
   * the floor that keeps a small, shallow forest from collapsing to a point.
   */
  ringGap?: number;
  /** Gap between neighbouring clusters, as a fraction of their radii. */
  clusterPadding?: number;
  /** Scene units per sqrt(node) used as a cluster's MINIMUM radius. */
  clusterScale?: number;
  /**
   * Target distance between two NEIGHBOURING nodes, in scene units — the one
   * knob that sets how spread out everything is. It drives both the ring radius
   * of a tidy tree (via its busiest ring) and the phyllotaxis disc spacing, so
   * every cluster renders at the same density and none reads as a solid blob.
   */
  nodeGap?: number;
}

const DEFAULTS = {
  ringGap: 130,
  clusterPadding: 0.18,
  clusterScale: 46,
  nodeGap: 44,
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
  /** The cluster's own footprint radius, in scene units. */
  radius: number;
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
 * Returns polar placements keyed by raw id, the depth reached, and how many
 * nodes each ring carries (`ringCounts[level]`) — the occupancy the caller
 * scales the tree by, so its busiest ring is never overpacked.
 */
function layoutForest(
  forest: HierarchyLayoutForest,
  present: (rawId: string) => boolean,
  ringGap: number,
): {
  placements: Map<string, { x: number; y: number }>;
  depth: number;
  ringCounts: number[];
} {
  const placements = new Map<string, { x: number; y: number }>();
  const ringCounts: number[] = [];
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
  if (roots.length === 0) return { placements, depth: 0, ringCounts };

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
    // Occupancy counts the STRUCTURE, not just the present nodes: an absent
    // node still consumes its wedge, so its neighbours can end up as close as
    // the full ring's spacing.
    ringCounts[frame.level] = (ringCounts[frame.level] ?? 0) + 1;
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

  return { placements, depth, ringCounts };
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
 * `engram_scene_hierarchies_v1` forests, keyed by raw registry id) as the
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
  const nodeGap = options.nodeGap ?? DEFAULTS.nodeGap;

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
    // Lay the tree out on UNIT rings (radius === level), then scale it to the
    // footprint its size deserves. A fixed ring gap would cram a 2030-node
    // forest into the same small disc as a 20-node one, so a large hierarchy
    // would render as an illegible dot next to the type clusters.
    const { placements, depth, ringCounts } = layoutForest(
      forest,
      (rawId) => indicesByRawId.has(rawId),
      1,
    );
    if (placements.size === 0) continue;
    if (depth > maxDepth) maxDepth = depth;
    // The BUSIEST RING sets the scale: a ring at unit radius `level` carrying
    // `count` nodes needs `level * scale >= count * nodeGap / 2pi` for two
    // consecutive nodes to sit `nodeGap` apart. Without this a wide-but-shallow
    // forest (2000 leaves, 4 levels) packs its whole leaf population onto one
    // ring a few units apart and renders as a solid donut — structure erased.
    let ringScale = 0;
    for (let level = 1; level < ringCounts.length; level++) {
      const count = ringCounts[level] ?? 0;
      if (count === 0) continue;
      const needed = (count * nodeGap) / (2 * Math.PI * level);
      if (needed > ringScale) ringScale = needed;
    }
    // The sqrt(size) target is kept as a FLOOR so a tiny forest still occupies a
    // sane footprint next to the discs; `ringGap` is the floor under both.
    const targetRadius = clusterScale * Math.sqrt(placements.size);
    const scale = Math.max(
      ringGap,
      ringScale,
      depth > 0 ? targetRadius / depth : ringGap,
    );

    const members: number[] = [];
    const local: Array<{ x: number; y: number }> = [];
    // Sorted for determinism: the placement map's insertion order follows the
    // traversal stack, which we do not want leaking into the output.
    for (const rawId of [...placements.keys()].sort(compareStrings)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const point = placements.get(rawId)!;
      const scaled = { x: point.x * scale, y: point.y * scale };
      for (const index of indicesByRawId.get(rawId) ?? []) {
        if (claimed[index]) continue; // first forest by sorted id wins
        claimed[index] = 1;
        members.push(index);
        local.push(scaled);
        hierarchyNodeCount += 1;
      }
    }
    if (members.length === 0) continue;
    clusters.push({
      key: hierarchyId,
      rank: 0,
      members,
      radius: Math.max(depth * scale, clusterScale),
    });
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
    // Same `nodeGap` as the trees: a phyllotaxis disc of spacing s gives each
    // node an area of pi*s^2, i.e. a nearest-neighbour distance of ~s.
    const local = members.map((_, index) => sunflower(index, nodeGap));
    looseNodeCount += members.length;
    clusters.push({
      key: type,
      rank: 1,
      members,
      radius: Math.max(nodeGap * Math.sqrt(members.length), clusterScale),
    });
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

  // SHELF packing on each cluster's OWN radius. A uniform grid sized by the
  // largest cluster turns every smaller one into a dot lost in its cell — which
  // is precisely how a 470-node forest disappears next to a 12k-node disc.
  let widest = 0;
  let totalArea = 0;
  for (const index of order) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const radius = clusters[index]!.radius;
    if (radius > widest) widest = radius;
    totalArea += radius * radius;
  }
  // Row width targets a square-ish overall footprint: the side of a square
  // holding every cluster's bounding box (sum of (2r)^2 = 4 * totalArea), with
  // room to spare so two comparable clusters share a row instead of each
  // claiming its own — the stack is what makes the scene tall and thin.
  const rowWidth = Math.max(widest * 2, 2 * Math.sqrt(2 * totalArea));
  const gap = widest * 2 * clusterPadding;

  /** [clusterIndex, centreX offset within the row] per row, then centred. */
  const rows: Array<{ indices: number[]; centres: number[]; width: number; height: number }> = [];
  let current = { indices: [] as number[], centres: [] as number[], width: 0, height: 0 };
  for (const clusterIndex of order) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const radius = clusters[clusterIndex]!.radius;
    const span = radius * 2;
    if (current.indices.length > 0 && current.width + gap + span > rowWidth) {
      rows.push(current);
      current = { indices: [], centres: [], width: 0, height: 0 };
    }
    const offset = current.width === 0 ? radius : current.width + gap + radius;
    current.indices.push(clusterIndex);
    current.centres.push(offset);
    current.width = offset + radius;
    if (radius * 2 > current.height) current.height = radius * 2;
  }
  if (current.indices.length > 0) rows.push(current);

  let rowTop = 0;
  for (const row of rows) {
    const shift = -row.width / 2;
    const centreY = rowTop + row.height / 2;
    for (let slot = 0; slot < row.indices.length; slot++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const clusterIndex = row.indices[slot]!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const cluster = clusters[clusterIndex]!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const local = localPositions[clusterIndex]!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const originX = shift + row.centres[slot]!;
      for (let m = 0; m < cluster.members.length; m++) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const nodeIndex = cluster.members[m]!;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const point = local[m]!;
        positions[nodeIndex * 2] = originX + point.x;
        positions[nodeIndex * 2 + 1] = centreY + point.y;
      }
    }
    rowTop += row.height + gap;
  }

  return {
    positions,
    clusterCount: clusters.length,
    hierarchyNodeCount,
    looseNodeCount,
    maxDepth,
  };
}
