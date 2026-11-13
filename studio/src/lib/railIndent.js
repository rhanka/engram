/**
 * ADAPTIVE rail indentation — the per-level step SHRINKS with depth.
 *
 * The left rail is narrow (~306px) and, now that the registry forests are
 * spliced INTO the ontology tree, a row can sit 7+ levels deep
 * (`Process → ABP → DE → DE.AI → DE.AI.01 → …`). A CONSTANT indent step is the
 * wrong shape for that: whatever value keeps level 1 legible either wastes the
 * rail at level 1 or eats the whole width by level 6, and the deepest rows lose
 * their label and their trailing badges to the rail's x-clip.
 *
 * So the step is a function of the row's OWN rendered depth, with two guarantees:
 *
 *   1. GEOMETRIC DECAY — `step(d) = BASE · DECAY^d`, floored at `MIN`. Each level
 *      costs less than the one above it, so the first levels stay clearly
 *      readable as structure while deep levels cost almost nothing.
 *   2. A HARD TOTAL BUDGET — the cumulative indent never exceeds `BUDGET`. Once
 *      the budget is spent the step is 0: an arbitrarily deep tree can never
 *      push a row's label + badges out of the rail.
 *
 * With the defaults the budget is reached asymptotically rather than abruptly
 * (Σ BASE·DECAY^d = BASE/(1−DECAY) ≈ 2.5rem < BUDGET), so the clamp is a safety
 * net for pathological depths rather than a visible cliff.
 *
 * Generic by construction: the scheme is driven by `depth` alone — no repo, no
 * artifact, no ABP/PROCESS_STD knowledge. Every consumer (ontology class rows and
 * registry-forest rows alike) shares ONE ladder, so a forest row nested under two
 * class levels continues the same decay instead of restarting it.
 */

/** Indent ladder defaults, in `rem`. */
export const RAIL_INDENT = {
  /** Step between depth 0 and depth 1 — the most legible level. */
  base: 0.7,
  /** Multiplier applied per level (0 < decay < 1). */
  decay: 0.72,
  /** Floor: a step never collapses to nothing while budget remains. */
  min: 0.16,
  /** Ceiling on the SUM of all steps — the rail can never be eaten. */
  budget: 2.6,
};

function options(opts) {
  return { ...RAIL_INDENT, ...(opts ?? {}) };
}

function toDepth(depth) {
  const d = Number(depth);
  return Number.isFinite(d) && d > 0 ? Math.floor(d) : 0;
}

/**
 * Cumulative indent (rem) of a row at `depth` — the sum of every step above it,
 * clamped to the budget. `depth` 0 (a root row) is always 0.
 *
 * @param {number} depth
 * @param {Partial<typeof RAIL_INDENT>} [opts]
 * @returns {number} rem
 */
export function cumulativeIndentRem(depth, opts) {
  const o = options(opts);
  const d = toDepth(depth);
  let total = 0;
  for (let i = 0; i < d; i += 1) {
    total += Math.max(o.min, o.base * o.decay ** i);
    if (total >= o.budget) return o.budget;
  }
  return total;
}

/**
 * The step (rem) to apply BETWEEN a row at `depth` and its children at
 * `depth + 1`. Decays geometrically, floored at `min`, and truncated by whatever
 * is left of the total budget (0 once the budget is spent).
 *
 * @param {number} depth  the PARENT row's depth (0 = a root row).
 * @param {Partial<typeof RAIL_INDENT>} [opts]
 * @returns {number} rem
 */
export function indentStepRem(depth, opts) {
  const o = options(opts);
  const d = toDepth(depth);
  const remaining = o.budget - cumulativeIndentRem(d, o);
  if (remaining <= 0) return 0;
  return Math.min(remaining, Math.max(o.min, o.base * o.decay ** d));
}

/**
 * The step as a ready-to-use CSS length (rounded to 1/1000 rem so the style
 * attribute stays stable and diff-friendly).
 *
 * @param {number} depth
 * @param {Partial<typeof RAIL_INDENT>} [opts]
 * @returns {string} e.g. `"0.7rem"`
 */
export function indentStepCss(depth, opts) {
  return `${Math.round(indentStepRem(depth, opts) * 1000) / 1000}rem`;
}
