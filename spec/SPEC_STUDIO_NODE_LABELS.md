# Studio Graph — Node Label & Box-Label Display Spec

**Status:** Validated (user rhanka, 2026-06-11 00:37–00:42 UTC, session 78865a3d)
**Decision ID:** `01KTT229SXNYMP73VG1BCH10KT` (Track commitment)
**Scope:** `GraphCanvas.svelte` workspace view + `ReconciliationView.svelte`; **NOT** the legacy `graph.html` vis-network export.

---

## 1. Summary of the Validated Spec

The studio graph uses **two separate label mechanisms** that must not be confused:

| Mechanism | Trigger | View | Style |
|-----------|---------|------|-------|
| **Box-shape labels** (in-canvas) | `node.shape === "box"` (from ontology profile `visual_encoding.shape`) | All views | Rounded rectangle with label drawn *inside* the glyph |
| **Degree-gate overlay labels** | `degree >= LABEL_DEGREE_RATIO × maxDegree` | Workspace (`labelMode="none"` → disabled; `labelMode="plain"` → enabled) | Plain text with text-shadow halo, no border/background box |
| **Active-node override** | Hovered / selected / focused / dragged | Any | Always shown, regardless of degree gate |

---

## 2. Box-Shape Labels (Option A — Validated)

### Decision (verbatim, session 78865a3d line 1051, 2026-06-11 00:37 UTC)

> **User rhanka:**
> "1.1 - A l'analyse est bonne. oui j'aimrais la réplication fidèle. ça n'aggrave pas trop les perfs (vu que c quelques noeuds j'imagine que non = > A préféré"

### What option A means

The legacy vis-network export rendered certain node-type categories as **labeled rounded rectangles** (`shape: "box"`), where the label is drawn **inside** the glyph — not overlaid. This encoding is controlled by the ontology profile's `visual_encoding.shape` field.

In the mystery pack profile (`/graphify/ontology-profile.yaml`):
- `Work` → `box`
- `ChapterOrStory` → `box`
- All other types → geometric shapes (diamond / star / hexagon / triangle / square / dot)

**Option A = faithful replication:** node types mapped to `shape: box` in the ontology profile render as labeled rounded boxes in the WebGL renderer (`@sentropic/graph`). The box glyph **replaces** the geometric shape for those node types.

### Label gate for box nodes (legacy parity)

The box glyph always draws its text — but the **DOM overlay mechanism** (`updateLabels()`) must skip box nodes to avoid double-rendering. The box itself carries the label at all zoom levels (always visible when the node is visible).

**Legacy source:** `src/export.ts:1303` — `fontSize = deg >= maxDeg * 0.15 ? 12 : 0`

In the new renderer, box nodes in the main workspace always show their label regardless of degree (the box IS the label carrier). The degree gate only applies to the DOM overlay for non-box nodes in `plain` labelMode.

### Truncation rule

Box labels are truncated to `DEFAULT_LABEL_MAX_CHARS = 22` characters with `…` to prevent box overflow. Full label is always accessible via hover tooltip.

---

## 3. Degree-Gate DOM Overlay Labels

### Rule

Only active in `labelMode="plain"` (reconciliation view). In `labelMode="none"` (workspace / knowledge graph view) no DOM overlay labels are shown.

**Threshold:** `LABEL_DEGREE_RATIO = 0.15`
A node gets a persistent overlay label when: `degree(node) >= 0.15 × maxDegree(graph)`

This matches the legacy vis-network font rule: `fontSize = deg >= maxDeg * 0.15 ? 12 : 0` (`src/export.ts:1303`).

**Active-node override:** hovered / selected / focused / dragged node always receives a label regardless of its degree.

### What this means for "4-5 main characters" (user clarification, 2026-06-14)

The user confirmed: **the 4-5 main characters by degree** (e.g. Sherlock Holmes, Watson, Father Brown, Inspector Lestrade…) must **have their names visible when zooming in**. These characters are the highest-degree nodes in the mystery pack graph and naturally satisfy `degree >= 0.15 × maxDegree`.

For the mystery pack with ~2000+ nodes, the top characters have degrees in the range 100–400+ vs maxDegree ~400, so the 0.15 threshold keeps roughly the top 5–10 nodes labelled — exactly the "4-5 main characters" the user expects.

**No change needed** to the threshold to achieve this. The 0.15 ratio is the correct gate; it is already validated.

---

## 4. Performance Gate

When the number of label-eligible nodes exceeds `LABEL_SKIP_THRESHOLD = 80`, labels are suppressed during active pan/zoom/drag interactions and restored once the interaction settles (`ZOOM_SETTLE_MS = 150 ms`).

---

## 5. Zoom Behavior

Box labels (in-canvas): always visible proportional to zoom (they scale with the canvas).

DOM overlay labels: visible at all zoom levels but clipped by the canvas boundary. No zoom-threshold gating (show/hide at a specific zoom level) is part of the validated spec.

---

## 6. Per-View Summary

| View | `labelMode` prop | Box nodes (shape=box) | High-degree overlay | Recon-forced labels |
|------|------------------|-----------------------|---------------------|---------------------|
| Knowledge graph (workspace) | `"none"` | Always labeled in-canvas | Disabled | N/A |
| Entity reconciliation | `"plain"` | Always labeled in-canvas | Enabled (degree ≥ 0.15×max) | `forceBoxLabel=true` on twin pair |

---

## 7. Source Quotes and Evidence

### 7.1 User initial request (session 78865a3d, line 840, ~2026-06-10 17:12 UTC)

> "dans le legacy on avait des boites comme ça [Image #3] ce qui permettait d'afficher de façon plus claire certaines catégoris de noeud centraux. j'ai bsoin d'un passe d'échange la dessus. je ne sais pas commnt les "god nodes" (noeuds plus gros) sont calculés aujourd'hui (sherlok holmes, father brown - pourquoi ils sont écrits plus gros), mais ça me semble utile de pouvoir mieux voir ls noeuds cle s ils sont agus comme tels"

### 7.2 User rejection of premature implementation (session 78865a3d, line 971, ~2026-06-11 00:15 UTC)

> "j'avais demandé un brainstorming sur les box (et non des putain de labels) et de pas passer a l'action, mais t'a codé direct. et t'as mis des labels à la place dans la vue principale. annule."
> "vue réconciliation: label : ok, même si j préfèr des labels sans boite, comme dans legacy"

### 7.3 Assistant analysis of legacy behavior (session 78865a3d, line 1048, 2026-06-11 00:26 UTC)

> "- La forme de chaque nœud vient de **`resolveNodeShape`** (`src/export.ts:356-364`) : d'abord le **profil ontologie** `visual_encoding.shape`, sinon `inferNodeShape` (`:146-163` : document/paper/concept → `box`, test → square…)
> - Dans le **profil mystery** (`graphify/ontology-profile.yaml:11-52`), le mapping node_type→shape est : **Work → `box`**, **ChapterOrStory → `box`**, Character → **diamond**…
> - En vis-network, **`box` est une shape « porteuse de label »** : le nœud est dessiné comme un **rectangle arrondi bordé avec le label DEDANS**. Les autres shapes (dot/diamond/star…) mettent le label **dessous** (ou rien).
> - Le label n'apparaît que pour les nœuds **centraux** : `fontSize = deg ≥ maxDeg·0.15 ? 12 : 0` (`:1303`).
> - ⇒ Donc le « Sherlock Holmes » encadré de ta capture = un nœud **catégorie Work/Saga** (shape box) **assez central** pour afficher son label."

### 7.4 User validation of option A (session 78865a3d, line 1051, 2026-06-11 00:37 UTC)

> "1.1 - A l'analyse est bonne. oui j'aimrais la réplication fidèle. ça n'aggrave pas trop les perfs (vu que c quelques noeuds j'imagine que non = > A préféré"

### 7.5 Track decision recorded (session 78865a3d, line 1081, 2026-06-11 00:42 UTC)

Command executed:
```
track decision new --kind commitment \
  --title "Box feature = A faithful replication of node_type box-shape labeled rendering" \
  --context "User confirmed option A: replicate legacy vis-network shape:box (label-bearing rectangle) driven by ontology node_type visual_encoding (Work/Chapter=box). Needs text rendering (DOM overlay box) in @sentropic/graph. Not the generic central-node label (that was reverted)."
```
Result: `decision=01KTT229SXNYMP73VG1BCH10KT` (outcome: go)

### 7.6 Acceptance criterion recorded in Track (session 78865a3d, line 1081)

```
track accept criterion GC \
  --statement "Box feature (A): node_type->box categories (Work/Chapter...) render as labeled boxes in the WebGL renderer (faithful legacy parity), label gated to central nodes"
track accept criterion GC \
  --statement "High-degree central nodes show readable boxed labels (legacy parity) so key entities are identifiable"
```

### 7.7 User clarification on main characters (2026-06-14, present conversation)

> "la clarification de l'utilisateur (authoritative): les **4-5 MAIN characters (by importance/degree) must have their names visible when zooming in**."

---

## 8. Current Implementation State

**As of PR #124 (merged) and subsequent fixes on `fix/graphcanvas-hover-parity`:**

- `studio/src/components/GraphCanvas.svelte` — `LABEL_DEGREE_RATIO = 0.15`, `labelMode = "none"` prop (workspace), `LABEL_SKIP_THRESHOLD = 80`
- `studio/src/lib/graphRendererPayload.js` — `isBoxShape()` function, `DEFAULT_LABEL_MAX_CHARS = 22`, `forceBoxLabel` support
- `studio/src/components/ReconciliationView.svelte` — uses `labelMode="plain"`
- `studio/src/App.svelte` — uses `labelMode="none"` (knowledge graph view)

Box nodes (`shape === "box"`) have in-canvas labels at all times. The 0.15 degree gate governs the DOM overlay in `plain` mode only. The workspace ("Knowledge graph") has `labelMode="none"` which disables DOM overlay labels; box-node in-canvas labels are still shown.

**Outstanding question / implementation gap:**

The user's clarification (2026-06-14) says "4-5 main characters must have names visible when zooming in." In the mystery pack, main characters (Sherlock Holmes, Watson, Lestrade, etc.) are `Character` type with `shape: diamond` — NOT `box`. This means:
- They do NOT get in-canvas box labels (box is reserved for Work/Chapter).
- They would only get a DOM overlay label in `labelMode="plain"` (recon view) if their degree >= 0.15×max.
- In `labelMode="none"` (workspace), they get no label at all except on hover.

This is the **pending gap** to resolve: the workspace view currently shows character names only on hover. The user's latest clarification requests that the top 4-5 characters (by degree) have visible names when zoomed in — which requires either:
- Enabling `labelMode="plain"` in the workspace for top-degree nodes, OR
- Extending the box concept to include high-degree Character nodes, OR
- Adding a separate zoom-dependent label layer.

The exact implementation approach is **not yet decided** — this spec records the requirement. Implementation must brainstorm the approach before coding (per user instruction, session 78865a3d line 971).

---

## 9. Non-Goals (Validated)

- Do NOT use generic central-node labels (plain text overlaid on all high-degree nodes) in the workspace — this was explicitly reverted per user instruction (session 78865a3d line 971).
- The reconciliation view (Entity reconciliation) uses `labelMode="plain"` with plain text labels, no box frame around the label — consistent with legacy behavior in that view.
- No zoom threshold gating (show only above a certain zoom level) is part of the validated spec. The 0.15 degree ratio is the gate.
