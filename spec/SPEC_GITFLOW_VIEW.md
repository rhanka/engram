# SPEC — Git-flow view (git-graph rendering of the agent-stats project graph)

> Status: **SHIPPED** — PR [#265](https://github.com/rhanka/graphify/pull/265), merge commit
> `b32e44f` (`feat(graph): git-flow view — port-based flow edges, merged-as grammar,
> lane-reuse layout + label legibility policy (P1+P2)`).
>
> Lineage: #253 (mat4 unified camera, the renderer substrate) and #255 (time-oriented
> inflected S-edges + lanes, the open ancestor lot that prototyped port-routed S curves)
> → #257 (`agent-stats` hybrid git skeleton: the Commit/Branch DAG data model this view
> consumes) → #264 (label-policy spec ratified) → **#265** (this view).
>
> Companion spec: [SPEC_GITFLOW_LABELS.md](SPEC_GITFLOW_LABELS.md) — the branch-label
> legibility policy. This document does NOT duplicate it (see §5).

## 1. Scope

The git-flow view renders the agent-stats **project graph** (#257) as a deterministic,
gitk/GitHub-network-style git graph: one horizontal band per repository, branches on
reusable lanes, commits ordered left→right, fork/merge connectors drawn **port-to-port**
as horizontal-dominant S curves, and agent sessions attached under the commits they
produced. It is a pure layout + routing + label-policy stack inside `packages/graph`
(`@sentropic/graph`) — no renderer/shader/scene-contract change; the renderer only
gained the generic flow-port route styles (§3).

Implementation surfaces:

| Brick | File |
|---|---|
| Layout (`computeGitFlowPositions`, `git-flow` layout id) | `packages/graph/src/layout-gitflow.ts` |
| Flow-port edge routing + tessellation | `packages/graph/src/render-geometry.ts:529-689` |
| Route-style codes / string mapping | `packages/graph/src/types.ts:72-77,142`, `packages/graph/src/styles.ts:91-99` |
| Branch-label legibility policy | `packages/graph/src/gitflow-labels.ts` (spec: SPEC_GITFLOW_LABELS.md) |
| Data producer | `src/agent-stats/project-graph.ts` via `graphify agent-stats project-graph` (`src/cli.ts:2641`) |
| All-repos build script | `.graphify/scratch/build-multi-gitflow.mjs` |
| Live UAT page | `.graphify/uat/gitflow-live/index.html` |

## 2. Visual grammar

Reference imagery: GitHub network graph / nvie git-flow / gitk. `braedonsaunders/codeflow` is now tracked as an additive graph-UX reference for visual polish, parametric layouts, and animated dynamics (`spec/SPEC_STUDIO_GRAPH_UX_CODEFLOW_PARITY.md`), but does not change the shipped grammar until a follow-up spec adopts concrete deltas. All rules below are
implemented in `layout-gitflow.ts` (header contract at `layout-gitflow.ts:1-43`) and are
**pure and deterministic** — no randomness, no camera coupling.

- **Per-repo bands.** Git nodes group into one horizontal band per repo (the `repo`
  attribute), bands stacked top-to-bottom in deterministic alphabetical repo order with a
  `bandGap` between them (`layout-gitflow.ts:302-318,669`). The repo is a colour
  community, never a rendered hub node.
- **Trunk = lane 0.** Per band, the trunk is the branch named `main` / `master` /
  `develop` (that priority, `layout-gitflow.ts:192,357-361`), else the headed branch with
  the longest first-parent chain, name-tie-broken (`:363-371`); with no branch heads at
  all, the childless commit with the longest chain (`:373-387`). Its first-parent chain
  occupies lane 0.
- **x = topological rank** (default `xMode: "rank"`). The trunk chain is ranked oldest =
  0 → newest right (`:389-394`); `x = (displayRank − windowStart) × rankGap`
  (`:527`). The alternative `xMode: "time"` axis is specified in §4.3.
- **Every other branch** is resolved by an exclusive first-parent walk from its tip
  (capped at `maxBranchLen` commits) down to the first already-placed commit = the
  **fork**; its exclusive commits rank `forkRank+1 …` (`:396-440`). Multi-pass, so
  branches forked off other branches resolve too. Branches with no resolvable fork
  (root reached / cap hit) **attach at the window left edge** with a dashed soft entry
  (`:441-449,475-483`); branches whose tip is already on a placed lane become
  **tip-only labels** (`:427-431,609-632`).
- **Lane-reuse (gitk-style interval colouring).** Each branch occupies a lane only over
  its `[displayFork, laneEnd]` interval; greedy smallest-free-lane over intervals sorted
  by start; a lane frees `laneReuseGap` ranks after the previous interval ends and is
  then reused (`:485-524`). ALL branches are placed — there is no top-K.
- **Display window.** Sized to enclose the kept forks (ideal = min fork − 2 ranks),
  capped at `maxWindow` ranks (`:452-457`). Trunk commits older than the window **park**
  (`placed = 0`) one rank left of the window edge, so window-left dashed entries visibly
  continue (`:531-543`). Orphan commits reachable from no branch walk also park
  (`:563-568`); everything the flow view ignores (non-git node types, headless branch
  nodes, unanchorable sessions) goes to an off-lane strip above the bands (`:766-771`).
- **Fork connectors = bare descending S.** The first-parent edge into a branch's first
  exclusive commit is the fork descent: routed port-to-port like every lane edge, but
  **without an arrowhead** (`arrow: false` → the `*-no-arrow` edge styles) — a
  descending arrow would read as an inverted merge (`:341-343,481,786-789`). In the
  reference grammar only merges and lane segments are arrowed.
- **`merged-as` = ascending arrowed S into the base.** A `merged-as` edge (branch tip
  commit → the merge/squash commit it landed as) draws as a `flow-port` connector with
  the arrowhead pointing INTO the base commit (`:798-806`). The merged branch's lane
  interval **extends to — and ends at — the merge commit's rank**, freeing the lane
  exactly there (`:489-491,503-507`).
- **Window-left entries are dashed** (`dash: "dashed"` when the parent commit is parked
  at the window edge, `:790-793`); structural edges (`branch-head`, `touched-branch`)
  are hidden (`:808-811`); `produced` / `derived-from` are short subtle `session-link`s
  (`:812-814`) — the one style allowed to break the left→right invariant
  (`:126-128`).
- **Sessions = agent-coloured triangles under their produced commit.** The layout
  sub-positions each Session under the first placed commit it `produced` (fallback: near
  its touched branch's tip), stacked at `sessionGap × (1 + 0.6k)` below the anchor
  (`:639-666`). The consumer draws them as small triangles coloured by agent kind — see
  the live page (`.graphify/uat/gitflow-live/index.html:51,101`: claude amber, codex
  sky, gemini/agy green).
- **Branch nodes are the label carriers**, positioned at the lane start (inset
  `0.6 × rankGap` left of the first commit, lifted `0.4 × laneGap` above the lane line
  so a pill never covers the entry S or the first arrowhead, `:194-203,570-608`).
  Which of them actually get a **name** is the label policy's decision (§5).

## 3. Edge styles (flow-port routing)

Contract in `packages/graph/src/render-geometry.ts:529-648`, single-sourced for the
Canvas2D fallback, the WebGL2 instanced-edge path, and hit-testing (`:534-537`).

**Route-style codes** (`render-geometry.ts:540-551`; string forms on the high-level edge
`edge_style`, `types.ts:72-77`, mapped in `styles.ts:96-99`; carried per-edge as
`GraphStyleBuffers.edgeRouteStyles`, `types.ts:142`):

| Code | `edge_style` | Semantics |
|---|---|---|
| 0 | `default` | Historical centre-to-centre routing (unchanged). |
| 1 | `flow-port` | Port-routed, drawn source→target as-is, **arrowed**. Used for `merged-as` merge connectors (the tip is older/left of the merge commit). |
| 2 | `flow-port-reverse` | Port-routed with the **endpoints swapped** before drawing (`routeIsReversed`, `:554-556`) — `commit-parent` data edges are child→parent (new→old), the drawing is old→new. Arrowed lane segments. |
| 3 | `flow-port-no-arrow` | Same routing as 1, **no arrowhead** (`routeIsArrowless`, `:559-561`). |
| 4 | `flow-port-reverse-no-arrow` | Same routing as 2, no arrowhead — the **fork descent** style. |

**Ports and geometry** (`flowPortEdgeGeometry`, `:594-648`):

- The edge **exits the source at its RIGHT border** and **enters the target at its LEFT
  border** — `P0 = (source.x + sourcePortOffset, source.y)`,
  `P1 = (target.x − targetPortOffset, target.y)` (`:601-604`); port offsets are the same
  `borderOffset` the node pass uses (circle radius / box half-width), so ports sit on
  borders by construction — never node-centre to node-centre.
- **Same row + forward** (|Δy| < 0.5 px and Δx > 0) ⇒ a **straight horizontal lane
  segment** (`:610-611`).
- Otherwise a **cubic Bézier S with horizontal end tangents**: `c1 = P0 + (k, 0)`,
  `c2 = P1 − (k, 0)`, `k = max(minStub, Δx/2)` forward, `minStub` backward
  (`:618-626`); `FLOW_PORT_MIN_STUB = 12` CSS px (× pixelRatio × zoom at the call
  site, `:563-568`), so even a near-vertical or backward edge visibly leaves rightward
  and arrives horizontally.
- **Tangents are exactly (1, 0) at both ports** (`:637-642`): an arrowhead — drawn only
  for arrow-carrying route codes — sits ON the target's left border pointing RIGHT.
  Time flows left→right.
- `tessellateEdge` samples the cubic (`:658-689`) with the same steps for rendering and
  hit-testing (render-curve == hit-curve).

The layout's `edgeHints` (§4.2) map onto these styles 1:1: `flow-port` +
`arrow: true|false` → codes 1/3, `flow-port-reverse` + `arrow` → codes 2/4 (see the
fixture builder in `.graphify/uat/gitflow-live/index.html:103-112`).

## 4. Layout API — `computeGitFlowPositions`

`packages/graph/src/layout-gitflow.ts:232`. Pure function; also registered as a
`LayoutFn` under the layout id **`git-flow`** (`GIT_FLOW_LAYOUT_ID`,
`layout-registry.ts:54,410`) via the adapter `gitFlowLayout`
(`layout-gitflow.ts:833-854`, positions only — callers needing edge hints / branch
labels call `computeGitFlowPositions` directly).

### 4.1 Inputs

`GitFlowInput` (`layout-gitflow.ts:51-76`): nodes `{id, type?, repo?, name?, t?}` +
edges `{source, target, relation?}` — exactly the #257 agent-stats project-graph model:

- node `type`: `Commit` / `Branch` / `Session` (anything else is off-lane);
- node `repo`: band key (the producer's `repo`/`project` attribute);
- node `name`: branch name (Branch nodes) — trunk pick + deterministic ordering;
- node `t`: commit committer-date, epoch-ms — consulted ONLY by `xMode: "time"`;
- edge `relation`: `commit-parent` (child→parent), `branch-head` (branch→tip commit),
  `produced` (session→commit), `touched-branch` (session→branch), `derived-from`
  (session→session), `merged-as` (branch tip commit → its merge/squash commit on the
  base branch) — indexed at `layout-gitflow.ts:275-300`.

Through the registry adapter, the same data arrives via `LayoutOptions`
(`packages/graph/src/types.ts:193-227`): `nodeTypes` / `nodeLanes` (repo band key) /
`nodeNames` / `nodeTimes` (node-order keyed) and `edgeRelations` (edge-order keyed),
plus `xMode` — all optional and additive.

Options (`GitFlowLayoutOptions`, `layout-gitflow.ts:79-112`; defaults `:183-189`):

| Option | Default | Meaning |
|---|---|---|
| `rankGap` | 60 | Horizontal distance between adjacent ranks. |
| `laneGap` | 44 | Vertical distance between adjacent lanes within a band. |
| `bandGap` | 140 | Vertical gap between repo bands. |
| `sessionGap` | 16 | Vertical offset of a session below its commit. |
| `maxBranchLen` | 40 | Per-branch exclusive first-parent walk cap. |
| `maxWindow` | 400 | Display window cap in ranks. |
| `laneReuseGap` | 1 | Ranks a lane stays reserved after an interval ends. |
| `xMode` | `"rank"` | X-axis mode — see §4.3. |

### 4.2 Outputs

`GitFlowLayout` (`layout-gitflow.ts:169-181`):

- `positions: Float32Array` — node-order-keyed, `2 × nodes.length` (setPositions shape);
- `placed: Uint8Array` — 1 = meaningfully placed on a band, 0 = parked/off-lane;
- `edgeHints: GitFlowEdgeHint[]` — edge-order-keyed route hints
  `{style: "flow-port" | "flow-port-reverse" | "session-link" | "hidden" | "default",
  dash?, arrow?}` (`:114-142`), the renderer-facing half of the grammar (§2, §3);
- `branchLabels: GitFlowBranchLabel[]` — label anchors `{nodeIndex, name, repo, lane, x,
  y, entry: "in-window" | "window-left" | "tip-only", tipX?, laneY?}` (`:144-167`) —
  the input of the label policy (§5) and of lane-interval hit targets (P1.3);
- `laneCounts: Map<repo, lanes>` (lane-reuse compactness gauge) and
  `windowStarts: Map<repo, first displayed trunk rank>`.

### 4.3 `xMode: "rank" | "time"`

Contract at `layout-gitflow.ts:94-111`, implementation `:672-764` (a post-pass by
design: the rank pass stays byte-identical — the regression pin — and time mode reuses
its lane/label/session structure verbatim):

- `"rank"` (default): x = topological display rank — the SEQUENCE view; every commit
  advances one `rankGap` regardless of when it happened.
- `"time"`: x ∝ the commit's `t` (git committer-date) on **ONE GLOBAL time axis shared
  by every repo band** (cross-repo comparability). The axis spans `[tMin, tMax]` of the
  placed dated commits and is scaled to the rank-mode width, so both modes fit the same
  camera (`:681-698`).
  - **Undated commits** interpolate linearly (by lane sequence position) between their
    nearest DATED lane neighbours; a run with no dated neighbour on either side **parks
    at its lane start** (the fork anchor; the axis origin for the trunk or fork-less
    lanes) (`:710-732`).
  - **Epsilon guard**: a per-lane min-spacing of `rankGap × 0.1`
    (`TIME_EPSILON_FRACTION`, `:204-209`), seeded at the fork, pushes same-instant /
    parked commits apart so they never collapse and lanes stay strictly left→right
    (`:733-740`).
  - Branch label anchors re-anchor to the moved commits (same inset/tip semantics,
    `:741-759`); sessions keep following their anchor's x (`:760-762`).
  - No dated commit anywhere ⇒ the rank x is kept wholesale (documented fallback,
    `:694`).

## 5. Branch-label policy — by reference

The label policy (which branch names actually render) is specified in
**[SPEC_GITFLOW_LABELS.md](SPEC_GITFLOW_LABELS.md)** (ratified (b), phases 1+2) and
implemented in `packages/graph/src/gitflow-labels.ts` — semantic compaction +
autogenerated demotion, MapLibre-style zero-overlap priority culling, zoom LOD tiers
T0/T1/T2 with hysteresis, bounded anchor fallback fork → tip → one stagger slot,
full-name interaction labels. Not duplicated here.

Two sizing knobs live on this view's boundary and are worth naming:

- **`labelScale` default 0.8** (`DEFAULT_GITFLOW_LABEL_SCALE`, `gitflow-labels.ts:85-93`
  — the "−20%" principal verdict of 2026-07-05): pill base height = `BOX_BASE_HEIGHT_PX
  (18, render-geometry.ts:32) × labelScale`, which drives font + padding + measured
  width together.
- **`boxBaseHeightPx`**: callers MUST hand the same resolved height to the renderer —
  `gitFlowLabelBoxHeightPx(options)` (`gitflow-labels.ts:396-401`) →
  `GraphRendererOptions.boxBaseHeightPx` (`types.ts:257`, resolved `renderer.ts:1095`) — so the policy's
  collision AABBs equal the drawn pills (see the live page,
  `.graphify/uat/gitflow-live/index.html:215`).

## 6. Data pipeline

```
graphify agent-stats sync                          # parse transcripts → facts
graphify agent-stats project-graph \
  --config cfg.json --out graph.json \
  --git-since all --git-max-count 3000             # per-repo Commit/Branch/Session DAG
graphify merge-graphs a.json b.json … --out m.json # multi-repo union
node .graphify/scratch/build-multi-gitflow.mjs     # the all-repos orchestration of the above
```

- **Producer** — `graphify agent-stats project-graph` (`src/cli.ts:2641-2698`): builds
  the rename-aware project graph of #257. Relevant options: `--config` (ProjectIdentity
  JSON), `--out`, `--no-commits`, `--no-branches`, `--git-since <date>` (hybrid git
  skeleton window, default `"6 months ago"`, `all` = full history) and
  `--git-max-count <n>` (default 2000) (`src/cli.ts:2652-2653`, plumbed at
  `src/agent-stats/index.ts:741-758`). It emits the relations the view consumes —
  `touched-branch`, `produced`, `commit-parent`, `branch-head`, `derived-from`
  (`src/agent-stats/project-graph.ts:519,559,625,666,683`) — plus `t` = committer-date
  on dated Commit nodes. It does **not** yet emit `merged-as` (§8).
- **Merge** — `graphify merge-graphs <graphs…>` (`src/cli.ts:3335`) unions per-repo
  graphs into one multi-band scene.
- **All-repos script** — `.graphify/scratch/build-multi-gitflow.mjs`: for every
  `~/src/<dir>` with a `.git` (mechanical rule, `:52-57`), writes a per-repo
  ProjectIdentity cfg, runs `sync` + `project-graph --git-since all --git-max-count
  3000`, keeps repos yielding >0 Session or >0 Commit nodes (`:103-104`), **de-collides
  commit node ids across repos** (`commit_<sha7>` is not repo-prefixed upstream;
  collisions rewrite to `commit_<repo>__<sha7>`, `:122-151`), runs `merge-graphs`, slims
  to the live-page shape — nodes `{id, type, repo, name?, agent?, t?}`, edges
  `{source, target, relation}` restricted to the six view relations (`:42-44,164-184`)
  — into `.graphify/uat/gitflow-live/real-graph.json`, and prints an honest per-repo
  summary table.

## 7. Live UAT page

`.graphify/uat/gitflow-live/index.html` — the shipped reference consumer (Canvas2D
backend). Serve the directory statically (node static server) and open `index.html`.

URL parameters (all optional):

| Param | Effect |
|---|---|
| `mode=real` | Start on the real all-repos dataset instead of the synthetic demo (`index.html:292`). |
| `x=time` | Start on the Temps axis (`xMode: "time"`); the Séquence/Temps toggle re-runs the layout on the same scene (`:57-60,286-289`). |
| `lg=<laneGap>` | Lane-gap comparison knob (e.g. `lg=55` = +25%); default 44 = the spec keeper (`:53-56`). |
| `z=<zoom>&cx=<worldX>&cy=<worldY>` | Deterministic camera override, applied inside `fit()` so late resize/fit cannot undo it (`:188-192,201`). |

Behaviour: wheel = zoom, drag = pan, `R` = refit, hover = full branch name (tooltip),
click = pin/unpin selection (`:30,239-261`); hover/selection hit targets cover the
branch **lane interval** `[fork, tip]`, not just the pill (P1.3, `:224-238`). The label
policy runs per frame with the previous `{tier, placed}` fed back for both hysteresis
mechanisms (`:203-218`). Repo colours: 4 historical repos pinned, every other repo a
deterministic FNV-1a palette pick (`:39-50`); sessions drawn as agent-coloured
triangles (`:51,101`). Real mode renders only sessions that produced a commit
(`:158-160`).

## 8. Verification & honest limits

Shipped gates: `packages/graph/tests/layout-gitflow.test.ts` (26 tests — trunk/lane-reuse/
window/port-direction/time-mode contract), `packages/graph/tests/gitflow-labels.test.ts`
(27 tests — policy invariants I1-I5), `packages/graph/tests/golden/gitflow-golden.test.ts`
(full-pipeline golden: determinism floor, port ink probes, no fork "bottom exit", all
branch colours present; Canvas2D + WebGL screenshot artifacts).

Known limits (deliberate, tracked):

- **`merged-as` producer emission is pending.** The layout + renderer implement the full
  merge grammar (§2), and the demo scene exercises it
  (`.graphify/uat/gitflow-live/index.html:141-143`), but
  `agent-stats project-graph` does not emit `merged-as` yet — it requires PR-merge
  detection on the producer side. Until that lands, real-data views show fork descents
  and lane intervals but no ascending merge connectors, and merged branches' lanes free
  at their tip rank instead of the merge rank.
- **Commit-id collisions across repos.** Upstream commit node ids (`commit_<sha…>`,
  `src/agent-stats/project-graph.ts:239-242`) are not repo-prefixed, and
  transcript-evidenced shas are 7-hex (`:176`) — across ~40 repos prefixes can collide
  and `merge-graphs` would silently fuse them. The all-repos script detects and
  rewrites collisions (`commit_<repo>__<sha7>`,
  `.graphify/scratch/build-multi-gitflow.mjs:122-151`); a producer-side repo-prefixed
  id is the clean future fix.
- **Mechanical repo matching.** The all-repos script matches any `~/src/<dir>/.git`
  (`build-multi-gitflow.mjs:4-5,52-57`) — an empty/uninitialized `.git` matches too and
  simply yields a failed/empty row; only repos with >0 Session or >0 Commit nodes are
  kept (`:103-104`). The summary table reports every candidate honestly.
- **The live page filters.** Real mode drops sessions without a produced commit
  (`index.html:158-160`) and the script keeps displayable repos only — the page is a
  rendering UAT, not an exhaustive session census.
- **Studio integration is the NEXT lot.** Nothing under `src/` references the
  `git-flow` layout id yet; the shipped consumers are the golden harness and the live
  UAT page. Wiring the view into the studio SPA (layout picker, agent-stats tab) is
  follow-up work.
