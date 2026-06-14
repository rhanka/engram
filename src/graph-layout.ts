/**
 * Deterministic force-directed graph layout (Barnes-Hut, O(n log n)).
 *
 * Pure TypeScript, no DOM. Computes stable (x, y) node positions so they can be
 * PRE-COMPUTED at build time and shipped inside `scene.json`. The studio then
 * pins them (`fx`/`fy`) and renders them directly, turning the former
 * ForceGraph-style ~O(n² × 300) mount simulation (a 1-3 s main-thread freeze on
 * the public pack) into an instant paint.
 *
 * The physics mirror the legacy `ForceGraph` `runSimulation` (same constants and the
 * same FNV/mulberry32 deterministic seed) so pre-computed positions look like
 * what the live component would settle to — but the O(n²) all-pairs repulsion is
 * replaced by a Barnes-Hut quadtree approximation (`theta`). This scales to large
 * graphs and is reused by the runtime Web Worker for on-demand re-layout (P2).
 *
 * Determinism: the seed is an FNV-1a hash over the SORTED node ids (not the
 * count), so adding/removing a node keeps the rest of the layout in place — the
 * same property the Studio relies on after a reconciliation merge.
 */

export interface LayoutGraphNode {
  id: string;
  x?: number;
  y?: number;
  /** Pinned x — when both fx and fy are finite the node is held fixed. */
  fx?: number;
  fy?: number;
  [key: string]: unknown;
}

export interface LayoutGraphEdge {
  source: string;
  target: string;
  [key: string]: unknown;
}

export interface ComputeLayoutOptions {
  /** Number of simulation ticks (default 300, matching the DS default). */
  iterations?: number;
  /** Layout space width — only sets the absolute scale (default 1000). */
  width?: number;
  /** Layout space height (default 1000). */
  height?: number;
  /** Repulsion factor, clamped to [0.1, 10] (default 1). */
  repulsion?: number;
  /** Barnes-Hut opening angle: larger = faster/looser (default 0.9). */
  theta?: number;
}

export interface LayoutResult {
  id: string;
  x: number;
  y: number;
}

// FNV-1a 32-bit over the joined sorted ids — identical to the DS `stableSeed`.
function stableSeed(ids: string[]): number {
  const sorted = [...ids].sort();
  let h = 0x811c9dc5; // FNV offset basis
  const joined = sorted.join("|");
  for (let i = 0; i < joined.length; i++) {
    h ^= joined.charCodeAt(i);
    h = Math.imul(h, 0x01000193); // FNV prime
  }
  h ^= sorted.length;
  return h >>> 0;
}

// mulberry32 PRNG — identical to the DS, so seeded layouts match.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SimNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fixed: boolean;
  /** ForceAtlas2-style mass: 1 + degree. Hubs repel harder → legacy-like spacing. */
  mass: number;
}

// ---------------------------------------------------------------------------
// Barnes-Hut quadtree. A region is either empty, a single body, or subdivided
// into four quadrants with an aggregate mass + centre of mass.
// ---------------------------------------------------------------------------
interface Quad {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  mass: number;
  cx: number; // centre of mass
  cy: number;
  body: SimNode | null; // set only while the region holds exactly one body
  divided: boolean;
  nw?: Quad;
  ne?: Quad;
  sw?: Quad;
  se?: Quad;
}

function makeQuad(x0: number, y0: number, x1: number, y1: number): Quad {
  return { x0, y0, x1, y1, mass: 0, cx: 0, cy: 0, body: null, divided: false };
}

function subdivide(q: Quad): void {
  const mx = (q.x0 + q.x1) / 2;
  const my = (q.y0 + q.y1) / 2;
  q.nw = makeQuad(q.x0, q.y0, mx, my);
  q.ne = makeQuad(mx, q.y0, q.x1, my);
  q.sw = makeQuad(q.x0, my, mx, q.y1);
  q.se = makeQuad(mx, my, q.x1, q.y1);
  q.divided = true;
}

function quadrantFor(q: Quad, x: number, y: number): Quad {
  const mx = (q.x0 + q.x1) / 2;
  const my = (q.y0 + q.y1) / 2;
  if (x < mx) return y < my ? (q.nw as Quad) : (q.sw as Quad);
  return y < my ? (q.ne as Quad) : (q.se as Quad);
}

function insert(q: Quad, body: SimNode): void {
  // Update aggregate centre of mass (each body contributes its FA2 mass, 1+degree).
  const m = q.mass + body.mass;
  q.cx = (q.cx * q.mass + body.x * body.mass) / m;
  q.cy = (q.cy * q.mass + body.y * body.mass) / m;
  q.mass = m;

  if (!q.divided && q.body === null) {
    q.body = body;
    return;
  }
  if (!q.divided) {
    // Region already holds one body — split and push the existing one down.
    const existing = q.body as SimNode;
    q.body = null;
    subdivide(q);
    // Guard against two bodies at (numerically) the same point: a tiny cell
    // would recurse forever, so stop subdividing once the cell is degenerate.
    if (q.x1 - q.x0 < 1e-6 && q.y1 - q.y0 < 1e-6) {
      q.body = body; // collapse — both bodies counted in mass already
      return;
    }
    insert(quadrantFor(q, existing.x, existing.y), existing);
  }
  insert(quadrantFor(q, body.x, body.y), body);
}

// Accumulate the Barnes-Hut repulsion on `body` from region `q`.
function applyRepulsion(
  q: Quad,
  body: SimNode,
  repulsion: number,
  theta: number,
  rand: () => number,
  force: { fx: number; fy: number },
): void {
  if (q.mass === 0 || (!q.divided && q.body === body)) return;

  let dx = body.x - q.cx;
  let dy = body.y - q.cy;
  let dist2 = dx * dx + dy * dy;
  const width = q.x1 - q.x0;

  // Far enough (cell small relative to distance) OR a single far body → treat
  // the whole region as one aggregate body at its centre of mass.
  if ((!q.divided || width * width < theta * theta * dist2) && q.body !== body) {
    if (dist2 < 0.01) {
      dx = (rand() - 0.5) * 0.1;
      dy = (rand() - 0.5) * 0.1;
      dist2 = dx * dx + dy * dy + 0.01;
    }
    const dist = Math.sqrt(dist2);
    // FA2-style kernel: the region's aggregate mass (Σ 1+degree) scales the push,
    // so hubs carve out wide personal space while leaves pack into tight fans —
    // the legacy vis-network `forceAtlas2Based` hub-and-spoke contrast.
    const f = (repulsion * q.mass) / dist2;
    force.fx += (dx / dist) * f;
    force.fy += (dy / dist) * f;
    return;
  }
  if (q.divided) {
    applyRepulsion(q.nw as Quad, body, repulsion, theta, rand, force);
    applyRepulsion(q.ne as Quad, body, repulsion, theta, rand, force);
    applyRepulsion(q.sw as Quad, body, repulsion, theta, rand, force);
    applyRepulsion(q.se as Quad, body, repulsion, theta, rand, force);
  }
}

/**
 * Adaptive iteration count for a graph of `n` nodes.
 *
 * MEASURED (WP1): layout cost is exactly linear in iterations, and the layout's
 * macro-structure (cluster placement, bbox spread) is set within ~60-90 ticks;
 * by ~120 ticks the mean per-node drift vs the full 300-tick layout has already
 * plateaued (the residual is orbital jitter, not progress), so iterations
 * 120..300 are wasted compute. Tiny graphs are cheap, so they keep the full
 * 300-tick settle for the smoothest result; everything else taper toward a ~120
 * working point and then a 90 floor at tens of thousands of nodes, where extra
 * ticks no longer change the picture. Reduces ONLY wasted compute — never nodes.
 *
 * 300 @ n<=300, easing to 120 @ n>=1500, floor 90 @ n>=20000.
 */
export function defaultLayoutIterations(n: number): number {
  if (!Number.isFinite(n) || n <= 300) return 300;
  if (n >= 20000) return 90;
  if (n >= 1500) {
    // 1500->120 easing to 20000->90.
    const t = (n - 1500) / (20000 - 1500);
    return Math.round(120 - t * 30);
  }
  // 300->300 easing to 1500->120.
  const t = (n - 300) / (1500 - 300);
  return Math.round(300 - t * 180);
}

/**
 * Compute deterministic (x, y) positions for a graph.
 *
 * @returns one `{ id, x, y }` per input node, in input order. Nodes with finite
 *          `fx`/`fy` are held fixed at those coordinates (warm-start / pins).
 */
export function computeLayout(
  nodes: readonly { id: string; fx?: number; fy?: number }[],
  edges: readonly { source: string; target: string }[],
  options: ComputeLayoutOptions = {},
): LayoutResult[] {
  const n = nodes.length;
  if (n === 0) return [];

  const w = options.width ?? 1000;
  const h = options.height ?? 1000;
  const ticks = Math.max(1, Math.round(options.iterations ?? 300));
  const theta = options.theta ?? 0.9;
  const repulsionFactor = Math.min(Math.max(options.repulsion ?? 1, 0.1), 10);

  const cx = w / 2;
  const cy = h / 2;
  const rand = mulberry32(stableSeed(nodes.map((node) => node.id)));

  const idIndex = new Map<string, number>();
  const sim: SimNode[] = nodes.map((node, i) => {
    idIndex.set(node.id, i);
    const fixed = Number.isFinite(node.fx) && Number.isFinite(node.fy);
    const angle = (i / Math.max(n, 1)) * Math.PI * 2;
    const r = Math.min(w, h) * 0.3 * (0.5 + rand() * 0.5);
    return {
      id: node.id,
      x: fixed ? (node.fx as number) : cx + Math.cos(angle) * r,
      y: fixed ? (node.fy as number) : cy + Math.sin(angle) * r,
      vx: 0,
      vy: 0,
      fixed,
      mass: 1,
    };
  });

  const links = edges
    .map((e) => ({ s: idIndex.get(e.source), t: idIndex.get(e.target) }))
    .filter((l): l is { s: number; t: number } => l.s !== undefined && l.t !== undefined);

  // FA2 mass = 1 + degree (same as vis-network's forceAtlas2Based solver).
  for (const l of links) {
    (sim[l.s] as SimNode).mass += 1;
    (sim[l.t] as SimNode).mass += 1;
  }

  const area = w * h;
  const k = Math.sqrt(area / Math.max(n, 1)); // ideal node distance
  const repulsion = k * k * 0.6 * repulsionFactor;
  const restLength = k * 0.6;
  const springK = 0.08;
  const gravity = 0.004;
  const damping = 0.85;
  let temperature = Math.min(w, h) * 0.08;
  const cooling = Math.pow(0.02, 1 / ticks);

  const force = { fx: 0, fy: 0 };

  for (let step = 0; step < ticks; step++) {
    // --- Barnes-Hut repulsion (O(n log n)) ---
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of sim) {
      if (node.x < minX) minX = node.x;
      if (node.y < minY) minY = node.y;
      if (node.x > maxX) maxX = node.x;
      if (node.y > maxY) maxY = node.y;
    }
    // Square, padded root so every body sits strictly inside.
    const span = Math.max(maxX - minX, maxY - minY, 1) * 1.01 + 1;
    const root = makeQuad(minX - 0.5, minY - 0.5, minX - 0.5 + span, minY - 0.5 + span);
    for (const node of sim) insert(root, node);

    for (const node of sim) {
      force.fx = 0;
      force.fy = 0;
      applyRepulsion(root, node, repulsion, theta, rand, force);
      node.vx += force.fx;
      node.vy += force.fy;
    }

    // --- Spring attraction along links ---
    for (const l of links) {
      const a = sim[l.s];
      const b = sim[l.t];
      if (!a || !b) continue; // indices were validated when `links` was built
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = (dist - restLength) * springK;
      const fx = (dx / dist) * f;
      const fy = (dy / dist) * f;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    // --- Gravity toward centre + integrate with capped, cooling step ---
    for (const node of sim) {
      if (node.fixed) {
        node.vx = 0;
        node.vy = 0;
        continue;
      }
      node.vx += (cx - node.x) * gravity;
      node.vy += (cy - node.y) * gravity;
      node.vx *= damping;
      node.vy *= damping;
      const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
      if (speed > temperature) {
        node.vx = (node.vx / speed) * temperature;
        node.vy = (node.vy / speed) * temperature;
      }
      node.x += node.vx;
      node.y += node.vy;
      // Loose safety walls only (runaway ejections): the degree-weighted
      // repulsion needs room to breathe or the spread flattens against the box.
      const padX = w * 1.5 + 16;
      const padY = h * 1.5 + 16;
      node.x = Math.max(-padX, Math.min(w + padX, node.x));
      node.y = Math.max(-padY, Math.min(h + padY, node.y));
    }
    temperature *= cooling;
  }

  return sim.map((node) => ({ id: node.id, x: node.x, y: node.y }));
}


/**
 * True when the WP1 fast-layout opt-in is enabled (env `GRAPHIFY_FAST_LAYOUT`
 * truthy: "1"/"true"/"on"). OFF by default, so the serve/build scene-layout is
 * byte-identical to today unless an operator opts in. Fully reversible.
 */
export function fastLayoutEnabled(): boolean {
  const raw =
    typeof process !== "undefined" && process.env ? process.env.GRAPHIFY_FAST_LAYOUT : undefined;
  if (!raw) return false;
  const v = String(raw).trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

/**
 * Pre-compute a scene's layout and pin it: writes `x`, `y` AND `fx`, `fy` onto
 * each node so the Studio can render pinned positions directly.
 * Mutates and returns the scene.
 *
 * WP1 opt-in (env `GRAPHIFY_FAST_LAYOUT`): when enabled AND the caller did not
 * pin `iterations` explicitly, use the ADAPTIVE (node-count-aware) iteration
 * budget instead of the flat 300. MEASURED: the layout's macro-structure settles
 * within ~60-120 ticks and the per-node drift then plateaus, so the extra ticks
 * up to 300 are wasted compute — cutting them roughly halves-to-thirds the cold
 * scene precompute (the dominant cost) with a visually equivalent layout, and
 * NEVER drops a node. With the env unset (default) behaviour is unchanged (300
 * ticks, byte-identical to today).
 */
export function attachLayoutPositions<
  T extends {
    nodes: Array<{ id: string; x?: number; y?: number; fx?: number; fy?: number }>;
    edges: Array<{ source: string; target: string }>;
  },
>(scene: T, options: ComputeLayoutOptions = {}): T {
  if (!scene || !Array.isArray(scene.nodes) || scene.nodes.length === 0) return scene;
  let opts = options;
  if (fastLayoutEnabled() && options.iterations === undefined) {
    // Opt-in: adaptive iteration budget, but never override an explicit caller value.
    opts = { ...options, iterations: defaultLayoutIterations(scene.nodes.length) };
  }
  const positions = computeLayout(scene.nodes, scene.edges ?? [], opts);
  const byId = new Map(positions.map((p) => [p.id, p]));
  for (const node of scene.nodes) {
    const p = byId.get(node.id);
    if (!p) continue;
    node.x = p.x;
    node.y = p.y;
    node.fx = p.x;
    node.fy = p.y;
  }
  return scene;
}
