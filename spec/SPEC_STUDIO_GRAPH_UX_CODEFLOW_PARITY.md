# SPEC — Studio graph UX: codeflow-parity (parametric layouts + animated WebGL dynamics)

> Status: **REQUIREMENT (principal-set, 2026-07-09)** — captured verbatim from a
> principal review of `braedonsaunders/codeflow` (added as an additive graph-UX
> reference upstream, tag `v1` / `main` at `af3b0073f2b41c9f54938c6520509fd97d133803`;
> see `UPSTREAM_GAP.md` "Codeflow intake" and `spec/SPEC_UPSTREAM_TRACEABILITY.md`).
> This is a **hard requirement to reach parity** with codeflow's graph experience,
> not a "maybe". It is additive graph-UX — it does not drive npm/Python parity
> versioning.
>
> Track seat: WP **Renderer & Views** (`01KW89F1EGCH2MZXDAY9T8D6D4`). Builds on the
> already-DONE **layout registry (Lot 0) + Variant A typed-layer**
> (`01KW89F4KC6KNF487KJMAXPYCR`) and the shipped **WebGL2 renderer**
> (dual-render switch, `@sentropic/graph`). Companion drafts:
> `.graphify/scratch/SPEC_GRAPH_DISPLAY_VARIANTS.md` +
> `.graphify/scratch/BRAINSTORM_GRAPH_DISPLAY_VARIANTS.md`.

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
- graphify's WebGL2 renderer already streams position frames capable of this
  (`LayoutEngine.run` yields `Iterable<PositionFrame>`), but the studio consumes a
  single static frame. The requirement is to **animate frame-to-frame** on layout
  change and slider change.

## 3. Requirements (R#)

- **R1 — Layout switcher in the studio graph view.** A single-select control:
  Force · Radial · Layers · Grid · Metro. Each maps to a named engine in the
  `@sentropic/graph` layout registry (P1 of the display-variants spec). Force,
  Layers already exist (Lot 0 / Variant A); **Radial, Grid, Metro are new engines**.
- **R2 — Live spacing controls.** Two sliders (Spread, Links) that re-run the
  active engine with updated `LayoutOptions` (`repulsion`/spread scale, edge-length
  scale) and animate to the new frame. Debounced; deterministic per (mode, spread,
  links, seed).
- **R3 — Display toggles.** Show labels (exists) + Curved links (generalise the
  flow-port curved-edge routing to a main-graph edge-style toggle).
- **R4 — Color-by.** Single-select: Folder (container/community), Layer (typed
  layer / ontology level), Churn (continuous scalar → sequential ramp). Churn
  requires a per-node scalar source (git churn where available via agent-stats;
  degree/activity fallback) + a DS sequential palette (see `dataviz` palette rules).
- **R5 — Animated dynamics on WebGL2.** Layout change and slider change animate
  node positions frame-to-frame (interpolate old→new positions), targeting smooth
  interaction at the process-std-am scale. Reuse the existing `PositionFrame` streaming
  contract and the WebGL2 instanced renderer; **no fallback to a static repaint**.
- **R6 — Metro layout.** Orthogonal routing engine (straight + 45° segments,
  even lane spacing). This is the visually distinctive request and the one with no
  current analogue — scope it as its own lot.
- **R7 — Parametric + fast.** All controls must stay responsive (the principal's
  bar is "super rapide"); layouts run in a worker or as bounded synchronous passes,
  never blocking the frame.

## 4. Mapping to existing graphify surfaces

| Requirement | Existing surface | Gap |
|---|---|---|
| Layout registry / named engines | `packages/graph/src/layout*.ts` (registry P1; `force`, `git-flow`, Variant A `banded`) | add `radial`, `grid`, `metro` engines |
| Position-frame streaming | `LayoutEngine.run(): Iterable<PositionFrame>` (`types.ts:147`) | studio consumes ONE frame — wire animation |
| WebGL2 instanced renderer | shipped (dual-render switch) | drive it from an interpolated frame stream |
| Curved edges | flow-port S-curves (git-flow path, `render-geometry.ts`) | expose as a general main-graph edge-style toggle |
| Colour axes | community/container + type colour (studio rail) | add continuous **Churn** scalar ramp axis |
| Spacing controls | `LayoutOptions.repulsion` etc. | expose as live studio sliders (Spread, Links) |

## 5. Non-goals / boundaries

- No code copied from codeflow — it is a **design/UX reference only** (AGPL-safety
  posture identical to repowise; confirm codeflow's licence before any code reuse).
- Does not change the ontology/data model — this is a **rendering + controls** WP.
- 3D (Variant D) and time-scrub (Variant E) stay in their own existing lots; this
  spec is the 2D parametric-layout + animation + colour-by parity surface.

## 6. Open decisions (for the principal / brainstorm)

- **D1 — Metro routing algorithm.** Orthogonal MST/metro-map layout vs a simpler
  grid-snap + orthogonal edge router. (Metro is the hardest engine.)
- **D2 — Churn source.** git churn via agent-stats commit history vs a generic
  per-node scalar field on the graph (degree/activity) when no git history exists.
- **D3 — Animation engine.** CPU position interpolation feeding the existing WebGL2
  instance buffers, vs a GPU-side vertex tween. (Start CPU-interp; measure.)
- **D4 — Worker vs main-thread layouts.** Which engines need a worker to keep the
  "super rapide" bar at process-std-am scale.
