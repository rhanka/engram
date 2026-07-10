# SPEC — Studio graph UX: codeflow-parity (parametric layouts + animated WebGL dynamics)

> Status: **REQUIREMENT (principal-set, 2026-07-09)** — captured verbatim from a
> principal review of `braedonsaunders/codeflow` (added as an additive graph-UX
> reference upstream, tag `v1` / `main` at `af3b0073f2b41c9f54938c6520509fd97d133803`;
> see `UPSTREAM_GAP.md` "Codeflow intake" and `spec/SPEC_UPSTREAM_TRACEABILITY.md`).
> This is a **hard requirement to reach parity** with codeflow's graph experience,
> not a "maybe". It is additive graph-UX — it does not drive npm/Python parity
> versioning.
>
> Track seat: WP **Renderer & Views** (`01KW89F1EGCH2MZXDAY9T8D6D4`), item
> `01KX4HFAWA726WEDD1HFRTXQRZ`. Builds on the already-DONE **layout registry
> (Lot 0) + Variant A typed-layer** (`01KW89F4KC6KNF487KJMAXPYCR`) and the shipped
> **WebGL2 renderer** (dual-render switch, `@sentropic/graph`). Companion drafts:
> `.graphify/scratch/SPEC_GRAPH_DISPLAY_VARIANTS.md` +
> `.graphify/scratch/BRAINSTORM_GRAPH_DISPLAY_VARIANTS.md`.
>
> **Double-consensus (2026-07-09): DONE, both peers `feasible-with-caveats`.**
> Peer A (Opus) + Peer B (Opus 4.8, xhigh) reviewed against source and converge.
> Their reconciled corrections are folded into R2/R3/R5 + §2.6 + §7 below.
> The single load-bearing insight: **every registered layout returns a
> node-order-keyed `Float32Array` of `2·nodeCount` floats parallel to the same
> `graph.nodeIds`** (`layout-registry.ts:38`; `layout-gitflow.ts:169-181`), so a
> morph between two *different* layouts is a trivial per-index lerp between two
> static buffers — there is **no correspondence problem** and the principal's
> "smooth transitions between layouts" is architecturally cheap (§2.6).

## 1. Why (principal verbatim)

> « il a exactement ce que je demande dans les organisations, et la layer
> graphique est super smooth : metro / layer / radial / grid / force très
> paramétrable et super rapide. je veux absolument la même chose, track cette
> exigence. le color by (Folder / Layer / Churn) est aussi top. et surtout y a la
> dynamique que nous on n'a pas alors qu'en webgl on doit pouvoir faire. »

Two things codeflow does that graphify does not yet:

1. **A rich, fast, parametric layout switcher** with live spacing controls — the
   organisation of the graph is legible and tunable, not a fixed hairball.
2. **Smooth animated dynamics** — layout changes and interactions animate fluidly.
   The principal is explicit: **this must be achievable on our WebGL2 renderer**;
   the current renderer paints statically and does not animate between layouts.

## 2. Observed codeflow UX surface (the parity target)

From the principal's captures (codeflow `Graph` view, settings popover + Color-by
rail):

### 2.1 LAYOUT (single-select, instant)
- **Force** — force-directed (what graphify has today).
- **Radial** — root/hub-centred concentric rings.
- **Layers** — layered / hierarchical bands (typed-layer; ~ our Variant A).
- **Grid** — regular grid placement.
- **Metro** — orthogonal "metro map" routing (straight/45° segments, evenly
  spaced) — the visually distinctive one; **explicitly requested**.

### 2.2 SPACING (live sliders, re-layout on drag)
- **Spread** — global spacing / repulsion scale (observed value ~190).
- **Links** — link length / edge-force scale (observed value ~70).

### 2.3 DISPLAY (toggles)
- **Show labels** — on/off (we have `labelMode`).
- **Curved links** — curved vs straight edges (we have flow-port S-curves in the
  git-flow path; needs to be a general edge-style toggle in the main graph).

### 2.4 COLOR BY (single-select)
- **Folder** — colour by directory/container (≈ our community/container colour).
- **Layer** — colour by typed layer / ontology level.
- **Churn** — colour by a per-node scalar heat (git churn / activity). **New axis
  for us**: a continuous scalar → sequential colour ramp, not a categorical bucket.

### 2.5 The differentiator — DYNAMICS
- Layout switches and slider drags **animate** (nodes glide to new positions),
  and the whole thing stays **smooth at 150+ files / 176+ links** in the capture.
- **Correction (double-consensus).** The engines do **not** stream frames:
  `createLayoutEngine.run` yields exactly **one** static frame
  (`layout-registry.ts:108-115`) and `computeLayout` runs all ticks then returns
  (`layout.ts:291-361`, no `yield`). There is no `PositionFrame` stream to consume.
  The animation is therefore a **studio-owned tween**, a bounded generalization of
  the merge-animation loop that already ships (`GraphCanvas.svelte:1005-1029`,
  `interpolateMergePositions` in `graphRendererPayload.js`): capture the current
  on-screen buffer, compute the target buffer once, lerp all nodes per rAF via
  `renderer.setPositions`. No solver streaming.

### 2.6 Cross-layout morph (principal-added requirement)
codeflow animates smoothly **between different layouts** (Force ↔ Layers ↔ Radial
↔ Grid ↔ Metro), not only within a force re-solve. Because every engine returns an
**index-parallel** position buffer (same `graph.nodeIds` order), this is one loop:
`out[i] = A[i] + (B[i] − A[i]) · ease(t)` over all `2·nodeCount` floats, edges
re-derived from node positions each frame (they follow for free). Load-bearing
constraints the implementation MUST honor:
- **Never tween across a scene-content change.** Group-by / weak-filter / time-scrub
  rebuild `scene` → new node indices; the morph must be a **renderer-level** control
  that leaves `scene` untouched (drive `payload.renderGraph.positions`, not `scene`).
- **The selection `$effect` is the sharpest hazard** — a hover/selection mid-morph
  runs `rebuildPayload → applyPayloadNoFit → setPositions` (`GraphCanvas.svelte:544-551`)
  and **clobbers** the interpolated buffer. The morph must own the position pipeline
  (suppress/queue restyles, or re-apply the live morph buffer after, cf.
  `reapplyDraggedPositions:522-531`).
- **`sceneSignature` auto-fit** (`:1042-1063`) keys on node x/y in `scene`; writing
  only to renderer buffers keeps it from refitting mid-morph. Do **one** deliberate
  `fitAndRender()` at `t=1` (the new layout has a different bbox).
- **Interruption:** switching layout mid-morph must **re-seed `A` from the live
  interpolated buffer**, not snap back to base (the merge loop re-interpolates from
  base — the one place it does the wrong thing for us).
- **Labels + hit-test read the payload buffer, not the tween** → hide labels and lock
  interaction for the morph (~300–500 ms), exactly as pan/zoom already do.
- **Keep git-flow OUT of the animated switcher** — its edges use discrete
  `edgeRouteStyles` codes (`render-geometry.ts:540-551`) that cannot lerp; it already
  has its own view.

## 3. Requirements (R#)

- **R1 — Layout switcher in the studio graph view.** A single-select control:
  Force · Radial · Layers · Grid · Metro. Each maps to a named engine in the
  `@sentropic/graph` layout registry (P1 of the display-variants spec). Force,
  Layers already exist (Lot 0 / Variant A); **Radial, Grid, Metro are new engines**.
- **R2 — Live spacing controls.** Two sliders: **Spread** → `computeLayout`'s
  existing `repulsion` (already honored, `layout.ts:246,281` — the studio force path
  is `attachForceLayout → computeLayout` directly, not the registry passthrough), and
  **Links** → a **new `linkDistance` param** (`restLength` is hardcoded `k·0.6`,
  `layout.ts:282`). **Debounce to drag-end** (an O(n log n × iters) Barnes-Hut solve
  cannot run per drag-frame at scale), then morph-tween to the result.
  **Determinism amendment (consensus):** a **cold** solve from a given seed is
  deterministic per (mode, spread, links, seed); an **interactive warm-started**
  re-solve is intentionally **path-dependent** (endpoint coherence beats reproducible
  coords — see R5/§2.6). Provide a **"Reset layout"** affordance for the deterministic
  cold solve.
- **R3 — Display toggles.** Show labels (exists) + Curved links. **Correction
  (consensus): this is nearly free and was over-scoped.** Main-graph edges already
  default to `curvature: 0.15` and both backends already draw the curve
  (`graphRendererPayload.js:343`, `render-geometry.edgeGeometry:461-527`); the toggle
  is just the scalar `0 ↔ 0.15` — control wiring, **not** the flow-port S-routing
  (`render-geometry.ts:594`), which is a separate discrete style and NOT needed here.
- **R4 — Color-by.** Single-select: Folder (container/community), Layer (typed
  layer / ontology level), Churn (continuous scalar → sequential ramp). Churn
  requires a per-node scalar source (git churn where available via agent-stats;
  degree/activity fallback) + a DS sequential palette (see `dataviz` palette rules).
- **R5 — Animated dynamics on WebGL2.** Layout change and slider change animate
  node positions frame-to-frame via a **studio-owned all-node tween** (§2.5/§2.6),
  NOT a solver stream. When the morph target is the **Force** engine (switch-to-Force
  *or* a slider re-solve), the target buffer must be **warm-started from the current
  on-screen positions** — `computeLayout` today circle-inits unfixed nodes by index
  (`layout.ts:256-261`) so a cold target has no spatial relation to the current view
  and the lerp becomes a full-graph teleport. Add an `initialPositions?: Float32Array`
  channel to `computeLayout`. Reuse the WebGL2 instanced renderer; **no fallback to a
  static repaint**. Perf note: per-frame `setPositions` is proven at ~2k nodes (mystery
  scale); measure before committing the main-thread morph at ≥10k (→ R7 / worker).
- **R6 — Metro layout.** Orthogonal routing engine (straight + 45° segments,
  even lane spacing). This is the visually distinctive request and the one with no
  current analogue — scope it as its own lot.
- **R7 — Parametric + fast.** All controls must stay responsive (the principal's
  bar is "super rapide"); layouts run in a worker or as bounded synchronous passes,
  never blocking the frame.

## 4. Mapping to existing graphify surfaces

| Requirement | Existing surface | Gap |
|---|---|---|
| Named layout engines | registry (`layout-registry.ts`): `force` (passthrough), `typed-layer` (= "Layers", DONE), `time-oriented`, `git-flow` | add `radial`, `grid`, `metro` — **only these 3 are new** |
| Animation transport | merge-loop tween `startMergeAnimation` + `interpolateMergePositions` → `setPositions` (`GraphCanvas.svelte:1005-1029`) proven on WebGL2 | generalize one-node → **all-node cross-buffer morph**; index-parallel buffers make it trivial |
| Studio ↔ registry seam | **studio does NOT consume the registry at all** (no `resolveLayout` under `studio/src/`) | net-new: a studio layout control that calls `resolveLayout(mode)` and drives the morph — **Lot 1 prerequisite** |
| Curved edges | main-graph edges already default `curvature:0.15`, both backends draw it (`graphRendererPayload.js:343`) | just a `0↔0.15` toggle — NOT flow-port routing |
| Colour axes | community/container + `node_type` colour (`graphRendererPayload.js`) | add continuous **Churn** scalar ramp (new scalar source) |
| Spacing controls | `computeLayout.repulsion` (honored) | add `linkDistance` + `initialPositions` (warm-start) params |

## 5. Non-goals / boundaries

- No code copied from codeflow — it is a **design/UX reference only** (AGPL-safety
  posture identical to repowise; confirm codeflow's licence before any code reuse).
- Does not change the ontology/data model — this is a **rendering + controls** WP.
- 3D (Variant D) and time-scrub (Variant E) stay in their own existing lots; this
  spec is the 2D parametric-layout + animation + colour-by parity surface.

## 6. Decisions (post double-consensus — defaults set, D5 needs principal)

- **D1 — Metro routing algorithm** → default **grid-snap nodes + orthogonal/45°
  edge router MVP**; true octilinear metro-map layout deferred. (Both peers.)
- **D2 — Churn source** → default **degree/activity fallback first**; git-churn via
  agent-stats later (it pulls in a data/extraction dependency, so Lot 5 is gated).
- **D3 — Animation engine** → **settled: CPU all-node tween** feeding the WebGL2
  instance buffers. GPU vertex-lerp is **rejected for now** — it touches the
  golden-tested shader draw path for a perf problem the CPU tween does not have;
  revisit only behind a measured need.
- **D4 — Worker vs main-thread** → O(n) engines (Radial/Grid) stay main-thread;
  the **Force re-solve** (and Metro at scale) move to a worker in the perf-hardening
  lot (Lot 7) once a node/edge budget is measured.
- **D5 — R2 determinism contract (NEEDS PRINCIPAL).** Interactive warm-started
  re-solves are **path-dependent** (a slider nudge settles from where nodes *are*, so
  the same (spread,links,seed) can yield different coords). The consensus proposes:
  keep determinism only for the **cold** "Reset layout" solve, accept path-dependence
  for live interaction. Confirm this UX contract, or require reproducible coords
  (which would forbid the warm-start and reintroduce the swirl).

## 7. Reconciled implementation plan (double-consensus — animation ships FIRST)

Ordered so the principal's differentiator (smooth animated dynamics) lands in Lot 1
on the engines that already exist, before any new layout.

| Lot | Title | Size | Deps | Acceptance |
|---|---|---|---|---|
| **1** | Studio↔registry seam + **all-node morph tween** | M | — | Force ↔ Layers morphs smoothly on WebGL2 at mystery scale; interrupt re-targets from live buffer; labels hidden during morph; one end-fit; **no golden change** |
| **2** | **Radial + Grid** engines (`layout-radial.ts`, `layout-grid.ts`) | M | 1 | both appear in the switcher and morph for free; deterministic O(n) |
| **3** | **Spread/Links** sliders → warm-started, debounced Force re-solve (`linkDistance` + `initialPositions` on `computeLayout`) | M | 1 | drag-end re-solve settles without swirl; Spread→repulsion, Links→linkDistance; Reset = cold solve |
| **4** | **Curved-links** toggle + **Color-by** Folder/Layer | S | 1 | toggle flips `0↔0.15` live; categorical re-colour instant |
| **5** | **Color-by Churn** (continuous ramp + legend) | M | 4 · **D2** | degree fallback ramp now; git-churn source later |
| **6** | **Metro** MVP (grid-snap + orthogonal router) | L | 1,2 · **D1** | nodes on lanes, orthogonal edges; morphs via Lot 1; octilinear deferred |
| **7** | Perf hardening: worker offload for Force, morph-interrupt polish | M | 1,3 · **D4** | Force slider stays "super rapide" at process-std-am scale; no main-thread stalls |
