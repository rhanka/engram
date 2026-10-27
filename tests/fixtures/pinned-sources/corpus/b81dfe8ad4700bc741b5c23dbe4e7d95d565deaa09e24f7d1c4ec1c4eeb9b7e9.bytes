# SPEC EVOL — GD-M2-CANVAS: the headless scene and its hit test

**Lot**: `GD-M2-CANVAS`, first slice.
**Package**: `@sentropic/diagram-canvas` 0.1.0, `private: true`.
**Written after the measurements below, not before them.** Every figure and every
verdict here carries the command that produced it. The first base measured was
`origin/main` at `e5accbf74a82f0fb59eee0eb4b476d242053a153`; the last base gated
was `2bcea7d4e610854e4a2ce0025b9f3df35c2eea81`, and each figure says which. The programme's
own lesson is that a specification holds exactly as far as it is measured: each
spec in this series written ahead of the implementation was refuted by the
implementer's measurement — the worker threshold, a contrast floor, an extractor.
So this one is written from measurement, and the two places where the measurement
contradicted what the lot's brief assumed are named in §2.

## 1. Owner constraints applied

- No Python anywhere, including inside a compound shell command.
- No attribution trailer in any commit or in the pull request.
- Code, comments and package documentation in English.
- An irreversible act — publishing, tagging, renaming a public export, making a
  private package public, changing an existing component's contract — stops and
  asks. None was needed: nothing published, nothing renamed, no existing
  package's contract touched.

## 2. Starting point, measured

### 2.1 What the plan says, and what the repository holds

`docs/graph-dataviz-migration-plan.md` §"État réel de M2" records
`GD-M2-CANVAS` as *non commencé*, with `@sentropic/diagram-canvas` absent.
Confirmed:

```
$ ls packages/ | grep -i canvas          # -> no output
```

Available and depended on: `@sentropic/diagram-core` 0.1.0 (`private: true`, no
dependency, no DOM) and `@sentropic/graph` 0.3.0.

### 2.2 What `diagram-core` actually exposes to a scene

```
$ cat packages/diagram-core/src/index.ts
$ sed -n '134,180p' packages/diagram-core/README.md      # "What this package does not import"
```

The barrel re-exports thirteen modules (`grep -c '^export \* from' packages/diagram-core/src/index.ts` → 13).
What a scene can consume without a DOM:

| Consumed | From |
|---|---|
| `Point`, `Geometry`, `EntityOccurrence` (with `z`), `RelationOccurrence` (with `waypoints`), `PortOccurrence` (`side`, `order`, `anchor`), `VisualGroup` (`collapsed`), `ViewFilter`, `PresentationState.camera`, `ViewDocument` | `src/view.ts` |
| `Entity`, `Relation`, `SemanticPort`, `SemanticDocument` | `src/document.ts` |
| `AttributeValue` (the `collection` variant carries `items`, not `value`) | `src/attributes.ts` |
| `DiagramState`, `createState` | `src/state.ts` |
| `Diagnostic`, `diagnostic()`, the closed `DiagnosticCode` union | `src/diagnostics.ts` |
| `canonicalise`, `hashContent` (`fnv1a64`, non-cryptographic) | `src/canonical.ts`, `src/hash.ts` |
| the seven nominal `*Ref` types and their guards | `src/refs.ts` |

The README's *"What this package does not import"* section answers "Nothing", and
explains that binding a migration-versioned persisted schema to another package's
evolving types is what the migration rule exists to prevent. **The consequence
taken here**: this package adds no dependency to `diagram-core`, and does not ask
for the `@sentropic/graph/contracts` subpath that §3.1 of the model spec offered —
see §4 on the `graph` edge.

Four places hand this lot named work, in the repository's own words:

- `src/view.ts` on `ViewFilter`: "This lot VALIDATES and PERSISTS them; it does
  not evaluate them. Deciding what a filter hides, and what happens to a relation
  whose endpoint is hidden … belongs to GD-M2-CANVAS".
- `src/view.ts` on `PresentationState`: "A renderer adapter maps these three
  numbers to its own camera contract; that adapter is GD-M2-CANVAS work".
- `README.md`, *What is not covered yet*: projection and geometry; "the world →
  view → CSS pixel → device pixel transform contract"; "Selection, geometric port
  editing and annotations: GD-M2-CANVAS, by SPEC 3.5".
- `tests/invariants.test.ts`, the suite *"stores no transform and claims no
  world-to-pixel contract"*, which **enforces** the boundary:
  `Object.keys(core).filter((name) => /transform|devicePixel|hitTest|matrix/i.test(name))`
  must be empty. A hit test added to `diagram-core` turns that guard red. This
  slice therefore could not have landed in `diagram-core` even if it had wanted to.

### 2.3 Is there already a scene or a collision test elsewhere in the repository?

Swept over `packages/graph`, `packages/dataviz-core`, `packages/components-*`,
`packages/dataviz-*`, `apps/`, `tools/`, `scripts/`, for `hit`, `hitTest`,
`scene`, `bbox`, `quadtree`, `spatial`, `intersect`, `aabb`, `pick`, `zIndex`,
`screenToWorld`, excluding `node_modules` and `dist`.

**Verdict: no scene model and no hit test exist. This slice is not a second
implementation.** The repository says so itself, in two places that disagree with
each other — see §8, contradiction 2:

```
$ sed -n '395,415p' packages/graph/src/types.ts
$ sed -n '14,18p'  packages/graph/FEATURES.md
```

What DOES exist, and what it means for this lot:

| Found | Where | Verdict |
|---|---|---|
| `OccupancyGrid`, a 64-px uniform spatial hash, `insert` + `collides` only, **private** | `packages/graph/src/gitflow-labels.ts` (~line 430) | A real spatial structure, but insert-only, with no point query and no id payload, for label placement. Not a pick index. Not exported. |
| `sx`/`sy`/`wx`/`wy`, the only screen↔world pair in the repository, **four private closures** | `packages/graph/src/gitflow-labels.ts` (~line 563) | A **centre-based** camera reading over a `GitFlowLabelCamera {x,y,zoom,width,height}` — a different contract from `diagram-core`'s three numbers. Recorded as a known duplication, see §7. |
| `cameraToViewProjection`, `ortho`, `multiply`, `transformVec4` — forward transform, **no exported inverse** | `packages/graph/src/mat4.ts` | Clip-space projection for the WebGL renderer, over `Float32Array`. No inverse to reuse. |
| `drawnRadius`, `boxDimensions`, `nodeGeometry`, `unitOutlinePoints`, `shapePolygonPoints` | `packages/graph/src/render-geometry.ts`, `shape-geometry.ts` | Declares itself the single source "so Canvas2D, WebGL, **and the hit-test** all consume ONE computation". **An obligation for the next slice**, not this one — see §4. |
| Barnes-Hut `Quad`, `subdivide`, `applyRepulsion`, **private** | `packages/graph/src/processing/graph-layout.ts` | A genuine spatial subdivision for N-body force approximation: no point query, rebuilt per iteration. Not a pick index. Not exported. |
| `pointInBox(px,py,x,y,w,h,pad = 4)`, **private, in five copies** | `packages/dataviz-core/src/priorityMatrix.ts` and `packages/components-{react,svelte,vue,angular}/src/priorityLabels.ts` | Strictly **open** on both edges with a 4-unit pad baked in, as a label-annealing cost term. Different semantics from a picking containment test (this package's is half-open and unpadded), private in all five, and the four DS copies exist precisely so the DS layer does not depend on `dataviz-core`. Recorded in §7. |
| `computePositionBounds(positions: Float32Array)` | `packages/graph/src/positions.ts` | A whole-cloud AABB for `fitView`. No per-item box, no index. |
| Chart hover: per-mark DOM event delegation; `chartCrosshair.ts` is `keys.indexOf(hoverKey)` | `packages/components-*` | DOM event routing and a string-key lookup. Not geometry. |
| `rectOverlapRatio(a: DOMRect, b: DOMRect)` | `packages/skills/src/engine/visualAudit.ts` | Nested inside a function serialised to `page.evaluate`; operates on `DOMRect`. DOM-bound QA tooling. |
| `ObjectLayerTree`, `pointIndex`, `fitBounds`, `zIndex` tokens, `PanelLayout` | many | Word collisions: a substring, a loop variable, a geo lon/lat bbox, CSS token scales, integer grid cells. |

**Consequence for the lot**: nothing changes about its content, and two things
change about its documentation — the `render-geometry.ts` obligation is written
into the package README so the next slice cannot miss it, and the two coexisting
camera readings are recorded rather than silently tripled.

### 2.4 The layering guard — the verdict, proven in both directions

```
$ cat scripts/verify-layering.test.mjs
```

The brief's worry was that `dsPackageDirs()` might select all of `packages/`, so
that a `diagram-canvas → diagram-core` dependency would turn the guard red
**although it is the edge the DAG wants**. Measured:

```
total package dirs: 150                                    # at e5accbf7, this lot's first base
excluded by the diagram-/dataviz-/graph prefix rule:
  ["dataviz-angular","dataviz-core","dataviz-react","dataviz-svelte","dataviz-vue",
   "diagram-canvas","diagram-core","graph"]
selected by the guard: 142
is diagram-canvas selected? false
```

Re-measured after the rebase, because `main` had meanwhile added four theme
packages and a stale count is the kind of number this series has been burned by:

```
total package dirs: 154                                    # at 3078c469
excluded by the diagram-/dataviz-/graph prefix rule:       # the same eight
selected by the guard: 146
is diagram-canvas selected? false

total package dirs: 154                                    # at 2bcea7d4, the last base gated
selected by the guard: 146                                 # unchanged
is diagram-canvas selected? false
```

`main` moved three times while this lot was gated, which in a tree of concurrent
worktrees is the normal case and not an incident: `refs/remotes/origin/main` is
shared, so another agent's `git fetch` advances it without this one asking. The
figure above was therefore taken again at each base rather than carried forward.

The selection is *nearly* all of `packages/` — 142 of 150, then 146 of 154 — but the eight it drops
are exactly the graph/dataviz/diagram layers, and `diagram-canvas` is one of them
by the `diagram-` prefix rule, before the `@sentropic/design-system` name filter
even applies. The guard's own header already declares the eight
`design-system-{fw}` → `graph` / `diagram-canvas` edges permitted.

**Verdict: the guard needs no change. The brief's hypothesis is refuted by
measurement.** Both directions, with the tree restored after each:

| Direction | What was done | Guard |
|---|---|---|
| A | `diagram-canvas` present, depending on `@sentropic/diagram-core` | `# pass 3 # fail 0`, exit 0 |
| B1 | `@sentropic/diagram-core` added to `packages/components-react/package.json` | `not ok 1 … must not depend on the dataviz/diagram-model layers`, exit 1 |
| B4 | `@sentropic/diagram-canvas` added to the same manifest | `# pass 3 # fail 0` — permitted, as the DAG intends for the next lot |

B1 is what proves A is not a vacuous green: the guard can still fail, on the
defect it exists for. Its regex is anchored (`/^@sentropic\/diagram-core$/`), which
is why B4 passes.

### 2.5 `private: true` is a consequence — confirmed

```
$ npm view @sentropic/diagram-core version
npm error code E404
npm error 404 Not Found - GET https://registry.npmjs.org/@sentropic%2fdiagram-core - Not found

$ npm view @sentropic/dataviz-core version
0.4.52
```

`@sentropic/diagram-core` does not exist on the registry. A published
`diagram-canvas` naming it as a dependency would have every consumer's install
fail on that 404 — the same class of defect `scripts/verify-layering.test.mjs`
records for PR #65, where a DS manifest named an unpublished `dataviz-core`
version and turned `pack:smoke` red. Inside the workspace the dependency resolves
by link and never touches the registry:

```
$ git diff -- package-lock.json
+    "node_modules/@sentropic/diagram-canvas": { "resolved": "packages/diagram-canvas", "link": true },
+    "packages/diagram-canvas": { "name": "@sentropic/diagram-canvas", "version": "0.1.0",
+      "license": "MIT", "dependencies": { "@sentropic/diagram-core": "0.1.0" } },
```

**Useful consequence: this lot depends on no npm publication**, unlike two other
lots of the programme currently blocked on one. The publishable package count is
unchanged at 17, which `scripts/verify-publishable-licensing.test.mjs` asserts.

## 3. What this slice delivers

One reason for the cut: **a scene model and a hit test are pure arithmetic, so
they are provable by deterministic unit tests with no browser and no scaffolding**
— which nothing downstream of them is.

### 3.1 The package

`packages/diagram-canvas`, `@sentropic/diagram-canvas` 0.1.0, `private: true`,
ESM, one dependency (`@sentropic/diagram-core` 0.1.0, pinned exactly, as
`dataviz-*` pins its siblings), no devDependency, `sideEffects: false`, MIT,
`LICENSE` present. `tsconfig.json` mirrors `diagram-core`'s compiler-enforced
DOM-free rule: `lib: ["ES2022"]`, `types: []`. `tsconfig.check.json` compiles the
tests too, because one suite is a compiler test.

### 3.2 `transform.ts` — the one transform of study invariant 8

`diagram-core` persists `camera: { x, y, zoom }`, validates the three finite and
`zoom > 0`, and **states nowhere what `x` and `y` mean**. This module fixes the
reading: the camera point is the world point drawn at the view origin, and `zoom`
is CSS pixels per world unit. Chosen over a centre-based reading so `worldToView`
is a function of the camera alone and needs no viewport.

`worldToView` → `viewToDevice` → `worldToDevice` is the whole chain, in SVG /
Canvas2D `matrix(a b c d e f)` order so an adapter can hand it to either.
`invert` answers `undefined` on a singular matrix rather than propagating
`Infinity`; `applyRect` returns the four-corner hull so it stays correct if a
rotation is ever composed in. `validateCamera` / `validateViewport` reuse
`diagram-core`'s own codes and thresholds — `value-not-finite`, and
`limit-exceeded` for `zoom <= 0` — so a caller never gets a second, differently
worded verdict on the same defect.

### 3.3 `geometry.ts` — two conventions, both measured into existence

`normaliseRect` is required, not cosmetic: `validateView` checks geometry values
are *finite* and has **no non-negativity branch** for `width`/`height`
(`packages/diagram-core/src/validate.ts`, the `finiteNumbers` call on
`entityOccurrences.*.geometry`; the only comparison branches in that function are
`anchor` in 0..1 and `camera.zoom > 0`). A negative extent is therefore valid
persisted data, and a scene reading `x .. x + width` as the span would make that
shape silently unselectable.

Containment is **half-open** (`x <= p.x < x + width`), so a point on the seam of
two tiled rectangles belongs to exactly one of them and "topmost" is not an
artefact of iteration order.

### 3.4 `visibility.ts` — filter evaluation and the cascade

The four points the persisted schema leaves open, each decided with its reason in
the module header and asserted in `tests/visibility.test.ts`:

1. **Several filters of one kind**: per kind, `include` filters are a union an
   element passes by matching any; `exclude` filters remove on any match;
   exclusion wins; kinds combine with AND. Intersecting two same-kind whitelists
   would empty almost every two-filter selection.
2. **What `attribute-equals` applies to**: entities and relations both, since
   both carry `attributes` and the variant names no element kind. An element
   lacking the attribute matches nothing — neither excluded nor included.
3. **Collection attributes**: the schema comment says the comparison is against
   "the attribute value's own `value` field", and a `collection` value has no
   `value` field, only `items`. A collection matches when any item's value, as
   text, equals the filter's.
4. **The cascade** — the question `diagram-core` names explicitly. A relation
   occurrence whose endpoint is not visible is excluded with reason
   `endpoint-hidden` and **reported**; a port whose owner is not visible,
   `owner-hidden`; a member of a `collapsed` group, `group-collapsed`. Study
   invariant 1 forbids an edge disappearing in silence, and an exclusion a caller
   cannot enumerate is exactly that.

### 3.5 `scene.ts` — the `Scene` / `GeometryFrame` object

`buildScene(state, viewRef, options) → SceneFrame`, in world coordinates.
Delivered from study §4.1's list: `sceneRevision`, rects, port anchors, relation
routes, z-order, hit regions, and the occurrence → semantic reference on every
item. Not delivered, and named: labels, contours beyond the rectangle, the group
box of a collapsed group.

- **The frame holds no camera.** A pan or zoom changes no geometry and no paint
  order; folding the camera in would move `sceneRevision` on every wheel event and
  destroy its only use. Asserted both ways.
- **Paint order is total**: plane, then kind (edge, node, port), then port
  `order`, then occurrence reference. `EntityOccurrence.z` is the only
  paint-order field in the model — a relation and a port occurrence have none —
  so a port inherits its owner's plane and an edge takes the lowest plane of the
  occurrences it joins.
- **Endpoints are visited in ascending role order**, never array order, because
  `diagram-core` states array position is not content ("Not a position:
  `endpoints[0]` means nothing"). A test writes the same two endpoints the other
  way round and asserts the frame is byte-identical.
- **Conservation**: every occurrence is an item or an exclusion, exactly once.

### 3.6 `hit.ts` — point, region and device-space hit testing

`hitTest` / `hitTestAll` walk `items` backwards, so topmost is last painted and
cannot disagree with a renderer. `hitTestRegion` takes an explicit
`intersect | contain` mode — both are real marquee conventions and neither is a
safe default — and tests an edge's **polyline**, not its bounding box, so a
diagonal edge is not caught across an area it never crosses.
`hitTestAtDevicePoint` **inverts the shared `worldToDevice`** rather than deriving
its own matrix, and converts a CSS-pixel tolerance to world units through the
zoom.

## 4. Out of scope

Named so the following lots do not open here: selection state and the marquee
lifecycle; geometric port editing; annotations and circling; the four framework
adapters; every rendering backend and export; labels and text measurement; the
group box of a collapsed group; layout and projection (delivered in
`@sentropic/graph/processing`); lasso and polygon selection; a spatial index
(§6.1); any npm publication; any change to `@sentropic/graph`,
`@sentropic/diagram-core` or a design system package.

**The `diagram-canvas → graph` edge of the DAG is deliberately NOT posed**, and
`tests/no-dom.test.ts` forbids the import so the omission is enforced rather than
intended. This scene is built from persisted view geometry, where every rectangle
carries its own extents: no layout to run, no drawn radius to derive. When the
canvas later hit-tests a graph-rendered scene it MUST consume
`packages/graph/src/render-geometry.ts`, which declares itself the single source
"so Canvas2D, WebGL, and the hit-test all consume ONE computation"; recomputing
those radii would be the hit↔render drift that module exists to prevent. That is
the next slice's obligation and it is written into the package README.

## 5. Acceptance criteria, all executed and recorded

1. **Scope**: the diff touches `packages/diagram-canvas/**`, `spec/**`,
   `docs/graph-dataviz-migration-plan.md`, `package-lock.json`. No other package,
   no script, no workflow. The layering measurement of §2.4 restored every file it
   touched (`git diff --stat` empty for `packages/components-react/package.json`).
2. **Gates in series, with their counts**: §6.3.
3. **DOM-free, four ways**: the compiler (`lib: ["ES2022"]`, `types: []`,
   asserted by reading the config); the runtime (node environment, a throwing
   proxy installed as `document`/`window`/`devicePixelRatio` across a full
   build-hit-marquee round trip); the source (every module's import specifiers,
   with exactly one bare name allowed and a floor on the file count); the
   manifest (`private: true`, one dependency, pinned to the version the workspace
   holds).
4. **The one bare dependency is not a vacuous rule**: a test asserts the set of
   bare specifiers is exactly `{"@sentropic/diagram-core"}` **and** that there are
   at least three of them, so the rule cannot pass by importing nothing.
5. **Nominal references survive the package boundary**: a compiler test with one
   `@ts-expect-error` per illegitimate assignment. Widen `sceneItemOf`'s parameter
   to `string` and `check` reports 3 × TS2578 — measured, §6.2.
6. **The exclusion reason list is compiler-exhaustive**: derived from a
   `Record<ExclusionReason, true>`, so a missing reason is TS2741 rather than a
   count nobody updates. This criterion exists because the first version of that
   list was a literal array with `satisfies`, and it silently omitted
   `endpoint-hidden` — the reason the cascade exists for. §6.2.
7. **Every new assertion is shown to fail on the defect it claims to catch**:
   §6.2, nine defects, each restored.
8. **No assertion is green on an empty set**: conservation compares against the
   view's own occurrence count; the source scan has a file floor; the bare-import
   rule has a floor; and `vitest run` exits 1 on an empty test set (§6.4), unlike
   `node --test`.
9. **Documentation**: `packages/diagram-canvas/README.md` in English states the
   three contracts fixed, the two measured surprises, what is not covered and who
   owns it; `docs/graph-dataviz-migration-plan.md` is updated for the real state.
10. **Form**: commit messages in English with a measured body; no attribution
    trailer; no Python.

## 6. Measurements

### 6.1 The linear hit scan, and why there is no spatial index

`buildScene` over a grid of N entity occurrences with seven interleaved planes,
then `hitTest` sampled 2 000 times after a 500-iteration warm-up, median
reported. A **miss** is the worst case: it scans every item. Node v22.22.1.

| nodes | `buildScene` ms | hit µs | miss µs | miss as a share of a 16 ms frame |
|---|---|---|---|---|
| 100 | 4.30 | 0.37 | 0.44 | 0.003 % |
| 250 | 5.30 | 0.21 | 1.21 | 0.008 % |
| 1 000 | 16.86 | 1.96 | 3.73 | 0.023 % |
| 5 000 | 64.07 | 15.24 | 18.41 | 0.12 % |
| 20 000 | 222.94 | 33.61 | 73.52 | 0.46 % |

The hit column is not monotonic between 100 and 250 (0.37 → 0.21 µs); that is
warm-up noise at sub-microsecond scale, and the miss column — the one that scans
everything — is the figure to read. It is linear at about **3.7 ns per item**.

Read plainly: at 20 000 items the worst case leaves room for roughly 13 600 hit
tests inside one 16 ms frame, and a pointer issues about one. **The scan is not
the cost centre; `buildScene` is** — 223 ms at 20 000 items, which is the number a
later slice should attack, not the scan. An index is therefore not warranted at
any size this slice's scenes reach, and adding one now would have been a third
private spatial structure in the repository to keep correct (§2.3). The threshold
where it starts to matter, extrapolating linearly, is around 10⁵ items for a
continuous rubber-band that hit-tests every frame.

This figure is deliberately **not** a test: a timing threshold in CI is a flake,
and a threshold a correct artefact can never meet is a prohibition rather than a
threshold.

### 6.2 Every new assertion, shown failing

Nine defects, applied one at a time to the working tree and restored after each,
from a pristine copy. Control before and after: `8 files, 112 tests, 0 failed`.

| Defect injected | Result |
|---|---|
| `normaliseRect` returns the rect unchanged | 4 red, incl. *contains the points of that span — the defect this exists to prevent* |
| containment made inclusive on the max edges | 4 red, incl. *gives a point on the seam of two tiled rectangles to exactly one of them* |
| paint order stops comparing the plane | 8 red, incl. *returns the node over the container it sits on*, *names the same occurrence from a device point as from the world point* |
| port anchor 0 read from the other end of the side | 3 red, incl. *reads anchor 0 from the west end on north/south* |
| the `endpoint-hidden` exclusion dropped silently | 3 red, incl. *conserves every occurrence under the hardest cascade* |
| the camera folded into the revision payload | 1 red: *does not move when only the camera moves* |
| `hitTestAtDevicePoint` derives its own matrix, ratio forgotten | 1 red: *names the same occurrence from a device point as from the world point it maps to* |
| one key removed from `REASON_KEYS` | `npm run check` exit 2: `src/visibility.ts(77,7): error TS2741: Property '"endpoint-hidden"' is missing` |
| `sceneItemOf`'s parameter widened to `string` | `npm run check`: `tests/types-nominal.test.ts(32,5) (34,5) (36,5): error TS2578: Unused '@ts-expect-error' directive` |

### 6.3 Gates, in series

Run three times, in series each time and never two sequences at once: at
`e5accbf7`, then replayed in full after the rebase onto `3078c469`, then replayed
in full again after the rebase onto `2bcea7d4` — because two changes merged back
to back mean the first never ran against the second. The counts below are the
last run, at `2bcea7d4`; the two earlier runs gave the same exits, and the
workspace counts moved from 152 to 156 as `main` added four theme packages.

| Gate | Exit | Count |
|---|---|---|
| `npm ci` | 0 | the rebase-merged lockfile installs clean; the dependency is still a workspace link, not a registry fetch |
| `npm run build` | 0 | 156 distinct workspaces; `diagram-core` before `diagram-canvas` |
| `npm run check` | 0 | 156 distinct workspaces |
| `npm run --workspace @sentropic/diagram-canvas test` | 0 | 8 files, 112 tests |
| `node scripts/run-script-guards.mjs` | 0 | 12 guard files, 63 tests |
| `npm run licensing:check` | 0 | 17 publishable packages |
| `node tools/graph-dataviz-provenance/verify.mjs` | 0 | 857 entries, 857 tracked files |

No gate was dispensed. `npm ci` was rerun rather than assumed because the rebase
auto-merged `package-lock.json`, and a bad merge there is exactly what it catches.
`run-script-guards` was rerun rather than dispensed because the incoming delta was
**not** invisible to it: `scripts/verify-theme-invariants.test.mjs` derives its
in-scope theme set by parsing the table rows of `.ds-scrap/METHOD-fr-top50.md`,
which the incoming commits edited.

Also run, outside the named list: `@sentropic/diagram-core` tests (11 files, 164
tests, exit 0), `@sentropic/graph` tests (32 files, 421 tests, exit 0), and the
root `npm test` in full.

**The root `npm test` passed, which refutes what this lot was told to expect.**
The brief, and `.github/workflows/verify.yml`'s own comment, hold that its second
half "needs a working Chrome for the packages/graph golden tests, so nobody could
use it as a gate". Measured here: **exit 0**, 156 workspaces, 63 guard assertions
in the first half and 7 488 vitest assertions in the second, zero failures, and
not one golden-skip warning in the log — so the Chrome-dependent captures really
ran. `command -v chromium` answers `/snap/bin/chromium` on this machine. The
blocker named in that comment is therefore ENVIRONMENTAL, not structural: on a
machine with a Chromium, the root `npm test` is usable as a gate.

One caveat, READ FROM THE CODE AND NOT MEASURED, because measuring it would have
meant removing Chromium: `packages/graph/tests/golden/gitflow-golden.test.ts`
guards its CDP assertions with `if (!chromeUp || !oracle) return;` INSIDE the
`it()` bodies, and a vitest test whose body returns early reports as *passed*, not
skipped — while the sibling `boxes-golden.test.ts` and `edges-golden.test.ts`
headers claim "an EXPLICIT skip — never a false pass". If that reading is right,
those captures are green having asserted nothing on a machine with no Chrome. It
is outside this lot; it is recorded because it is the same defect shape
`scripts/run-script-guards.mjs` exists to prevent one level up.

No provenance entry is due: the verifier's `PACKAGES` array covers
`packages/graph` and the five `dataviz-*`, and `packages/diagram-canvas` is not
among them. Every line here is locally authored and copied from no upstream, so
there is no `adapted-*` entry and no upstream `sha256` to record.

### 6.4 `vitest` does not go green on an empty set

```
$ npx vitest run --root packages/diagram-canvas 'tests/**/*.nomatch-zzz.ts'
No test files found, exiting with code 1
```

Unlike `node --test`, whose exit-0-on-empty behaviour is what
`scripts/run-script-guards.mjs` exists to compensate for. So this package's test
gate needs no file floor of its own, and the source-scan floors inside the suites
cover the case where `src/` empties instead.

## 7. Unknowns, risks, and known duplications

- **Two camera readings coexist.** This package fixes an origin-based reading over
  `diagram-core`'s three numbers; `packages/graph/src/gitflow-labels.ts` carries a
  centre-based one in four private closures over a camera that also holds
  `width`/`height`. Neither is wrong; they answer different questions and one is
  not exported. Unifying them changes a published package's semantics and is not
  this lot's to do. **Signal to stop rather than work around**: if a later slice
  needs the graph camera, it is an owner decision, not a refactor.
- **`pointInBox` exists in five private copies** (§2.3) and this package adds a
  sixth containment predicate. It is not the same predicate — strictly open with a
  4-unit pad for label annealing, versus half-open and unpadded for picking — and
  importing `dataviz-core` here would pose an edge the DAG does not declare, from
  a private package onto a published one. Recorded rather than hidden.
- **The `render-geometry.ts` obligation is deferred, not discharged.** The next
  slice that hit-tests a graph-rendered scene must consume it. Written into the
  package README because a deferred obligation nobody wrote down is how the drift
  that module forbids would reappear.
- **`sceneRevision` is `fnv1a64`**, non-cryptographic like `diagram-core`'s own
  `hashContent`. It detects change; it proves nothing.
- **A hyperrelation's route is a polyline through its anchors in role order.**
  That is a hit region and nothing more; real routing for a 2..8-member
  `association` is later work, and the code says so where it is.
- **Filter evaluation's four decisions are reversible** while no consumer depends
  on them. The day a framework adapter ships against them they become a contract.

## 8. Contradictions found between the repository's documentation and its code

Reported because they cost measurement time and will cost it again.

1. **The DAG has no per-edge `status`.** `docs/graph-dataviz-migration-plan.md`
   line 124 says the `diagram-core → graph` edge "reste `"status": "proposed"`",
   and `packages/diagram-core/README.md` says that is "what that file already
   says". Measured: `grep -n '"status"' docs/graph-dataviz-architecture-dag.json`
   returns **one** line, line 3, a document-level property. `edges` is an array of
   two-element arrays with no status field at all. The two documents describe an
   edge-level status the file does not have.
2. **`packages/graph` says both that hit testing is deferred and that it is done
   and verified.** `FEATURES.md` line 17, under *Deferred*: "GPU picking, hover
   index, **hit testing**, labels, and tooltips." `src/types.ts` lines 398-413
   describes CPU picking as existing, backend-agnostic and "(Verified by
   `studio/src/tests/pickingBackendAgnostic.test.js`.)"
3. **That cited test does not exist in this repository.**
   `git ls-files | grep -i pickingBackendAgnostic` returns nothing and there is no
   `studio/` directory: the reference survived the repatriation and now points at
   an artefact of the upstream repository. A verification claim whose evidence is
   absent reads as a verification.
4. **The `attribute-equals` filter comment cannot be read literally.**
   `packages/diagram-core/src/view.ts` says the comparison is "against the
   attribute value's own `value` field, as text", while
   `packages/diagram-core/src/attributes.ts` gives the `collection` variant
   `items` and no `value`. §3.4 decision 3 fills the gap; the comment is narrower
   than the union it describes.
5. **`width` and `height` are documented as "persisted presentation" with finite
   values, and nothing forbids a negative extent.** Not a contradiction in words,
   but a gap wide enough that a scene reading the field naively is silently wrong;
   §3.3.
