# KIT-NOTES — Capitalisation Input from `build-v6` (`live-git-indexing`)

## Scope Audited

Five static r7-style Design-System diagrams (`wide` desktop + `narrow` phone = **10 SVG scenes**), built from the `§4.1`–`§4.5` tables of `DOSSIER-CONTENU-v5.fr.md`:

| Scene | Architecture pattern | Zones | Cards | Links | Styles in legend |
| --- | --- | ---: | ---: | ---: | --- |
| `d1` (`§4.1`) | Multi-owner architecture with **nested sub-zone** (`grp_cm_storage` inside `grp_cluster_mesh`) | 7 | 22 | 24 | `key`, `link`, `dashed` |
| `d2` (`§4.2`) | 5-column logical data model + bottom transverse governance band | 6 | 19 | 21 | `link`, `dashed` |
| `d3` (`§4.3`) | Event fan-in bus (`trg_* -> que_coalesce`), emphasised decision (`chk_stable`), rounded « Non » return loop | 6 | 13 | 14 | `key`, `link`, `dashed` |
| `d4` (`§4.4`) | Two side-by-side comparison panels (`pnl_local_states`, `pnl_branch_states`) | 2 | 14 | 12 | `key`, `dashed` |
| `d5` (`§4.5`) | Three compared panels (`sys_ref_tool`, `sys_verdict_bridge`, `sys_our_live_git`) | 3 | 12 | 9 | `key`, `link`, `dashed` |

---

## 1. What the Kit Computed Automatically

1. **Card & Zone SVG Anatomy (`ds.mjs`):**
   - Retouched `368×158` card frame (`-20 %` width, `-21 %` height, `-36.8 %` area vs r7's `460×200`), icon glyph placement (`46×46`), header rule, proposed dashed frame, and emphasis outer double frame.
   - **Horizontal and vertical centring of card descriptions:** `text-anchor="middle"` at the horizontal centre of the body box (`x = 186`) and automatic vertical centring (`bodyBlockTop`) between `bodyY` (under the header/title) and `bodyAreaBottom`, whether the card has 1 or 2 body lines and whether its title wraps onto 1 or 2 lines.
   - **Title wrapping with slack margin:** automatic 2-line wrapping at `0.90 × headerTextWidth` so 23–25 character French titles wrap onto 2 lines instead of crowding 1 line.
   - **Zone header height probing (`zoneContentTop`):** exact top inset computed from the zone's width, kicker, title, and subtitle before placing child cards.

2. **Connector Path Geometry, Rounded Elbows, Arrowheads & Pills (`diagram-kit.mjs`):**
   - Port coordinate resolution `at(boxId, side, frac)` and inverse port fraction `fy(boxId, y)` / `fx(boxId, x)` so orthogonal legs stay axis-aligned to `< 0.01` SVG units.
   - Automatic arrowhead tip trimming (`trimStart`, `trimEnd`) and quadratic Bézier rounded elbows (`Q` curves with `cornerRadius = 18` default, `26–28` on return loops, clamped to half the shortest adjacent segment).
   - Automatic pill box width/height measurement (`pillWidth`, `pillHeight`), background plate (`PAPER` fill, `rx="8"`, style-matched stroke/dash), and automatic free-space centring on straight links (`link()`) so pills clear arrowheads by `>= 12` units.
   - Line-style legend rendering (`legend()`): automatic swatch + arrow rendering, multi-column width measurement, bounding-box registration for collision linting, and tracking of covered edge styles.

3. **2-Sided Narrow Rail Routing (`routeNarrowRails` in `diagrams.mjs`):**
   - Given a vertical card stack in `narrow` (`NARROW_W = 660`), **all cross-card links** (`20` in `d1`, `12` in `d2`, `6` in `d3`, `1` in `d4`, `9` in `d5` = **48 narrow links**) were routed automatically without hand-picking rail X coordinates or port fractions:
     - Sorts edges/bundles by vertical span ascending (innermost rails `x = 100 / 560` first, outer rails up to `6` tracks per side at `18` unit pitch);
     - Picks conflict-free port slots (`0.22 / 0.40 / 0.60 / 0.78`) biased toward target direction (`top` when going up, `bottom` when going down);
     - Shares trunk segments cleanly for declared `bundle` groups (`readers-narrow`, `trg-bus-narrow`).

4. **Hard Build-Time Lint & Fidelity Gates (`diagram-kit.mjs` + `diagrams.mjs`):**
   - Parent-child nested zone containment & z-ordering (`zoneDepth`), sibling zone disjointness, card-in-zone containment, text slack (`90 %` body / `92 %` title & kicker), zero edge-leg crossings, zero foreign-pill crossings, zero card crossings, zero zone-border pill straddles, mandatory legend coverage whenever `usedEdgeStyles.size > 1`, 1:1 `§4` table parity, and 100 % source-file word provenance (`fileWords`).

---

## 2. What Still Had to Be Placed or Tuned by Hand

1. **Macro Grid & Column/Zone Dimensions (`wide` scenes):**
   - Choosing scene canvas widths (`2460` to `2712`), column X starts, inter-column corridor widths (`134` to `610` units depending on whether horizontal pills sit inside the corridor), and nested sub-zone inner channel margins (`subX = c3 + 60`, `xStorageCard = subX + 52` in `d1-wide` to leave `>= 30` unit leg lengths on inner rails).
   - Computing explicit `y` stacks (`stack(ct, items)`) with `VGAP = 108` wherever a vertical link carries a pill vs `28–42` where no pill sits between cards.

2. **Planar Node Ordering Within Zones (Crucial for Both `wide` and `narrow`):**
   - Even with `routeNarrowRails` automating rail coordinates, **planar vertical ordering of cards inside a zone** had to be chosen by hand so intervals nest (`[A, D]` containing `[B, C]`) instead of interleaving (`A < B < C < D`) on both sides at once.
   - Concrete example in `d1-narrow`: placing `cmp_private_objects` first, `cmp_h2a_supervisor` second, `cmp_disclosure_guard_h2a` third, and `cmp_key_custody` fourth inside `grp_h2a_host` turned two circle-graph interleavings (`lnk_a04` vs `lnk_a07/a08` and `lnk_a09` vs `lnk_a22/a23`) into strictly nested Russian-doll intervals.
   - Similarly in `d1-wide`, placing `cmp_extractors` at the top of `grp_engram_live`, `cmp_safe_observer` in the middle, and `cmp_scheduler` at the bottom (with `up` arrows `lnk_a04 -> lnk_a05 -> lnk_a06`) aligned `cmp_extractors` horizontally with `cmp_live_adapter` and eliminated crossings in corridor 2→3.

3. **Multi-Bend `via` Corridors & Pill `labelAt` Fractions in `wide`:**
   - Long-range cross-column links in `d1-wide` (`lnk_a22`, `lnk_a23` bottom rails; `lnk_a13`, `lnk_a14` left channels) and `d2-wide` (`lnk_b07`, `lnk_b08` top-left nested loops; `lnk_b15`, `lnk_b18`, `lnk_b19` perimeter lanes) required hand-specified `via: [['h', x], ['v', y], ...]` coordinates and `labelAt: [segIndex, t]` fractions so pills sat in empty pockets away from neighbouring rails and zone borders.
   - Deciding which secondary shared-corridor rails omit redundant canvas pills (keeping full accessible `<title>` and `<details>` relation labels) when a corridor (`134–180` units wide) cannot fit three `130`-unit-wide pills side by side.

4. **Custom SVG Primitives via `extra()` (`d3-wide` Event Fan-In Bus):**
   - The vertical collector bar (`xBus = 446`, round junction dots + trunk arrow into `que_coalesce`) in `d3-wide` was drawn via `s.extra('d3-event-bus', { passable: true, attachTo: 'que_coalesce', ... })` with manual coordinates, whereas a first-class `s.bus()` primitive could compute the collector bar automatically from `[sources] -> target`.

5. **Concise 1–2 Line Card Body & Pill Copy Selection:**
   - Selecting 2-line verbatim-vocabulary summaries (`<= 30` chars/line) from `DOSSIER-CONTENU-v5.fr.md` for each of the 80 cards and ~65 pills, plus trimming 5 zone kickers so every line stayed below the `90 % / 92 %` tightness threshold.

---

## 3. Capitalisation Recommendations for `@sentropic/diagram-canvas` (`ds-layout-hints@2`)

| Priority | Candidate kit primitive | Eliminates manual work in |
| --- | --- | --- |
| **P1** | **Promote `routeSideRails` + circle-graph bipartite side assignment (`2-coloring` of interleaving intervals + intra-zone barycentric/nesting permutation)** into `diagram-kit.mjs` | Eliminates manual `preferSide` hints and manual intra-zone card reordering across all `narrow` scenes and single-column stacks |
| **P1** | **First-class `s.bus(id, { from: [...], to, orientation })` collector primitive** | Eliminates custom `s.extra(...)` SVG coordinate math for fan-in/fan-out buses (`d3`) |
| **P2** | **Corridor width auto-solver (`solveColumns`)** that sizes inter-zone gaps from the widest pill assigned to each corridor + rail count × pitch | Eliminates manual column X tuning (`c1..c4`, `cor12..cor34`) and prevents zone-border pill straddles by construction |
| **P2** | **Perimeter lane allocator (`routePerimeter(edge, 'top' \| 'bottom')`)** with automatic inner-before-outer nesting by endpoint X/Y order | Eliminates manual `via` coordinates on long-range governance/return loops (`d1` `lnk_a22/a23`, `d2` `lnk_b07/b08/b15/b18/b19`, `d3` `lnk_c07`) |
| **P3** | **Automatic 2-line body/pill balancer (`wrapToLines(text, maxWidth, 2)`)** integrated into `card()` and `edge()` | Eliminates manual `['line 1', 'line 2']` splits in scene definitions |
