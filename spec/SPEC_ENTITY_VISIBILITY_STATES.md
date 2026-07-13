# SPEC — Entity visibility states (4-state per-entity control)

**Status:** FROZEN design (v1) — awaiting cross-vendor double-consensus hardening before implementation.
**Branch:** `feat/entity-visibility-states` (off main @ ce61be4).
**Supersedes:** the single "group" checkbox per left-rail row.

## 1. Goal & principal-validated ergonomics
Replace the per-row group **checkbox** with a **4-state** per-entity control:
**Normal · Grouped · Hidden · Solo** (mutually exclusive per entity). All state changes
animate **smoothly**, reusing the group/ungroup **position-carry-over** animation shipped
in `a2cf207` (no force re-solve, no camera refit — shared nodes stay put).

The principal validated this ergonomic direction:
- **NOT** a 4-way click-cycle (undiscoverable, multi-click, jarring intermediate renders).
- **At-rest state glyph** on every row (state visible at a glance across all ~122 rows)
  **+ a hover/focus-revealed 4-way segmented control** (any state in **one click**, tooltips,
  radiogroup a11y). Touch fallback: the glyph opens a 4-radio popover.
- A **global "Show all / Reset"** affordance (clears Hidden/Solo/Grouped → Normal).

## 2. State model
Each **entity** (a left-rail row = a community, an ontology class, or a type) holds exactly
one of:
- **Normal** (default) — visible, ungrouped.
- **Grouped** — members collapse into the entity's group node (existing collapse engine).
- **Hidden** — the entity's nodes are excluded from the rendered scene.
- **Solo** — focus. See §3.

## 3. Solo = reversible, multi (principal-chosen)
- Setting entity X to **Solo** flips the **complement to display-Hidden** (the principal's
  "afficher seulement bascule le complémentaire en Masqué").
- **Reversible:** Solo is a DISPLAY OVERLAY, not a destructive bulk edit. Each non-Solo
  entity keeps its OWN stored state (Normal/Grouped/Hidden); while ≥1 Solo is active the
  renderer shows ONLY the Solo entities and hides the rest. Clearing all Solo restores every
  entity to its stored state.
- **Multi-Solo:** several entities may be Solo at once → "show only this SET".
- **Exit:** toggling a Solo entity back to Normal removes it from the Solo set; the global
  Reset clears all Solo (and Hidden/Grouped).

## 4. Transitions (reuse the carry-over engine)
Every transition is **position-preserving** — `applyCarriedScene` + the fade machinery from
`a2cf207` (`runGroupTween`, `interpolateGroupFadeStyle`, `morphPositions`, `groupSwapPending`,
the position cache `lastKnownPosById`/`coordinateEpoch`). NO re-solve, NO camera refit, ever.
- **→ Grouped / → Normal-from-Grouped:** the existing fold/unfold animation.
- **→ Hidden:** the entity's nodes **fade out + shrink in place** (target = "gone", not folded
  to an anchor); remaining nodes carried (frozen).
- **→ Normal-from-Hidden:** nodes **fade in** at their cached prior positions (constellation
  cache) or neighbour-centroid.
- **→ Solo:** the complement fades out (identical to Hide, applied to all non-Solo). **Exit
  Solo:** complement fades back in at cached positions.

## 5. Data-flow (to be grounded by the double-consensus against the real code)
- **viewerState** today carries a grouped-key set (`viewerState.js` `withGrouped`, the
  `collapsedClassIds`/grouped keys). Extend to a per-entity **state map** + a **Solo set**
  (or a single map with a Solo value + a "solo active" derived flag). Must stay
  backward-compatible with any persisted viewer state (migration path).
- **groupBy.js / classNodes.js** already turn grouped keys → collapse targets. Extend so the
  scene builder ALSO emits the **hidden node set** = Hidden entities' nodes ∪ (when any Solo
  is active) the non-Solo complement's nodes. The scene excludes hidden nodes.
- **groupTransition descriptor** (the `{direction, anchorByNodeId}` consumed by GraphCanvas)
  must generalize to cover Hide/Show and Solo-enter/exit — i.e. a per-change descriptor that
  the animation can play: folded set (→ anchor), hidden set (→ fade in place), revealed set
  (→ fade in from cache). Likely `{grouped, ungrouped, hidden, revealed, anchorByNodeId}`.
- **LeftRail.svelte** renders the rows; replace the checkbox with the state widget (§1) and
  wire clicks → viewerState mutations. The existing **"Group all to Domain/Sub-domain/Type"**
  bulk buttons write the SAME state model (bulk → Grouped) and animate the same way.

## 6. Edge cases (double-consensus to resolve, with recommended defaults)
1. **A node in multiple entities** (e.g. shared across communities/types): hiding one entity
   should hide a node ONLY if it is not kept visible by another visible/Solo entity. Recommend:
   a node is rendered iff at least one of its owning entities is currently visible.
2. **Grouped ∩ Solo:** soloing a Grouped entity shows only its **group node** (its collapse
   stands); its stored Grouped state is preserved. Setting an entity to Solo does NOT change
   its Grouped/Normal storage — Solo is an overlay (§3).
3. **Reset mid-transition:** a Reset while a tween runs must complete the pending swap
   synchronously (per the animation's interrupt rule) then apply the reset as one carried swap.
4. **Bulk group-all + Solo active:** the bulk sets stored states; the Solo overlay still gates
   what renders. Resolve ordering.
5. **Empty result** (Solo an entity with no on-screen nodes, or Hide everything): position-
   preserving no-op / graceful empty — never a refit or a crash.
6. **Performance at ~122 rows / ~2000 nodes:** state changes must be O(changed nodes), the
   hidden-set computation incremental where possible.

## 7. Verification contract (for the implementing PR)
- **Unit (vitest):** the state reducer (Normal/Grouped/Hidden/Solo transitions incl. multi-Solo
  + reset); the hidden-set derivation (Hidden ∪ Solo-complement, multi-entity node ownership);
  the extended groupTransition descriptor; the LeftRail widget wiring (source-string like the
  existing rows). Keep the animation's existing behavioural tests green.
- **CDP visual UAT** (the decisive check, run only when RAM is stable / with principal OK):
  each of the 4 states animates position-preservingly (shared-node screen delta < 1px, camera
  x/y/zoom unchanged); Solo hides the complement + restores it on exit; multi-Solo shows the set.
- Studio suite green except the 3 known jsdom failures; lint clean; build succeeds.

## 8. Open items the double-consensus MUST close
1. Exact **viewerState schema** (state map vs map+solo-set) + persistence migration.
2. Exact **groupTransition descriptor** shape covering all 4 states + Solo enter/exit, and how
   GraphCanvas plays a mixed change in ONE tween.
3. Multi-entity **node ownership** rule for the hidden set (recommend §6.1).
4. Precise **Solo-overlay vs stored-state precedence** and the render/derivation order.
5. Widget details: exact glyphs, hover vs focus reveal, touch popover, global-Reset placement,
   full a11y (radiogroup + labels).
6. Whether Hide/Solo need to touch `classNodes.js` (fold engine) or only the scene filter.

---

## 9. v2 — RECONCILED decisions (cross-vendor double-consensus: Fable 5 + Opus)

Both independent passes (`.graphify/research/entity-states-review-fable.md`,
`entity-states-review-opus.md`) — the implementer follows THIS section; the two review
docs carry the full per-file plan, reducer, and adversarial tables. Where they diverged I
arbitrated (noted). This is now the implementation contract.

**SPINE (both, load-bearing).** The `groupTransition` descriptor (`App.svelte:229-237`) is
derived from the collapse fold-delta and is **blind to Hide/Solo** → implemented as the v1
spec reads, every Hide/Solo change yields an empty delta → `groupTransition===null` → the
scene `$effect` hard-cuts via `resetLayoutState(); updateGraph()` (**refit**), violating the
sacred no-refit invariant. FIX = a **content-derived visibility delta** feeding an extended
descriptor. This is the heart of the feature.

**D1 — Ownership rule (AMENDS spec §6.1; both dissent).** §6.1's "render iff ≥1 owning entity
visible" is DEAD ON ARRIVAL — every node is owned by its Normal-by-default Type/class chain,
so Hide becomes a no-op. Correct: **Normal ABSTAINS**; **Hidden = union suppression** (a node
hides iff ANY of its owning entities is stored-Hidden); the "≥1 visible" whitelist union
applies ONLY inside the **Solo tier** (when solo active: `visible = members(solo) \
members(storedHidden \ solo)`).

**D2 — Schema (arbitrated → Fable's shape; it uniquely satisfies both §2 exclusivity AND §6.2
solo-preserves-grouped).** Keep `groupBy.grouped` UNCHANGED; add `options.visibility =
{ hidden: string[], solo: string[] }` keyed by the existing namespaced keys
(`ontology:|community:|type:`). Stored state ∈ {Normal, Grouped, Hidden} is exclusive; **Solo
is a separate overlay set** (a Grouped entity soloed shows its group node — Solo never mutates
grouped/hidden storage). Reducer: `setEntityState(key, state)` (enforces exclusivity of
grouped/hidden/normal) + `toggleSolo(key)` + `resetVisibility()`. Migration = defaults in
`normalizeViewerState` (there is NO localStorage in studio/src — verified). **`classNodes.js`:
ZERO changes.**

**D3 — Extended descriptor + 3 MANDATORY guards (both; guards from Fable).**
`{ folded, unfolded, hiddenIds, revealedIds, kind }`. Play in GraphCanvas via the SAME
`applyCarriedScene`/`runGroupTween`/`interpolateGroupFadeStyle`/`groupSwapPending`/
`lastKnownPosById` — folded→anchor (existing), **hidden→fade-in-place (`bufB==bufA`)**,
revealed→fade-in-at-cached-target. Guards (each closes a real trap):
(a) **anchor-id exclusion** — else every shipped pure-collapse silently degrades to mixed/no-anim;
(b) **∩ scene-ids** — else a hidden-then-folded id masquerades as revealed;
(c) **generation gate** — closes a latent pre-existing model-switch coordinate-carry hole this
feature would amplify.

**D4 — Mixed change classification (both).** Per node classify OUT (in old only) / IN (in new
only) / two-sided. OUT and IN each animate as one tween; a genuinely **two-sided** change =
**carried NON-animated swap** (never a refit — strictly better than today's mixed⇒refit).
Global **Reset is provably pure-IN** → animates coherently. Sequential two-phase = V2 (flagged).

**D5 — Derivation order (both).** grouped fold → `buildScene` → **visibility mask** (Solo union
> stored Hidden > Normal, per D1) → time/weak filter → **transition diff LAST**, computed on the
**pre-time-filter** mask so time-scrub never spawns tweens. Scene filter =
`applyVisibilityToScene` (empty mask ⇒ SAME reference for the byte-identity fast path); a group
node's visibility follows its entity via the synthetic-node predicates
(`community_key`/`type_name`, never id parsing).

**D6 — Widget (both).** New `EntityStateControl.svelte`: at-rest SVG state glyph + hover/focus-
revealed **4-segment OVERLAY** (no rail reflow at 122 rows), WAI-ARIA radiogroup + roving
tabindex, touch popover via the DS `Popover`; global **"Reset visibility"** in the rail header /
under the search stats. Rows absorbed by a collapse are disabled. Wire clicks → the D2 reducer.

**File plan (~600 LOC, both converge):** `viewerState.js` (reducer + normalize),
new `entityVisibility.js` (mask + hidden-set + the D1 rule), `groupBy.js` (compute the
visibility transition + wire the descriptor), `App.svelte` (unify the descriptor advancing both
prev-snapshots, apply the 3 guards), `GraphCanvas.svelte` (route hidden/revealed through the
existing carry-over tween), new `EntityStateControl.svelte` + `LeftRail.svelte` wiring.

**Adversarial must-tests (both):** the two descriptor classification traps (D3 a/b) as
regressions; the epoch-bump-wipes-reveal-cache + two-snapshot-desync (Opus risk table); the D1
union rule at mystery scale (Hide is NOT a no-op); Solo-preserves-grouped; multi-Solo; Reset =
pure-IN animates. CDP visual UAT deferred until RAM is stable / principal OK.
