# SPEC EVOL — GD-M2-DS-PRESENTATION: one real edge, Svelte ForceGraph → @sentropic/graph/processing

Status: implement, 2026-09-25.
Target: one PR to `main`, branch `feat/gd-m2-ds-presentation`.
Scope: **Svelte only**. React, Vue, Angular are a later lot and are not opened here. No canvas, no worker wiring, no public API rename.

Every statement below was measured in this worktree on 2026-09-25. Commands are reproducible from the repo root.

## 1. Guard state (still "not started" — the plan's claim holds)

`docs/graph-dataviz-migration-plan.md` §"État réel de M2" says GD-M2-DS-PRESENTATION is not started:
the four `design-system-{fw}` → `@sentropic/graph` edges stay permitted by
`scripts/verify-layering.test.mjs` and none is posed. Verified still true:

- The guard has exactly 3 tests (`node --test scripts/verify-layering.test.mjs` lists them).
  `FORBIDDEN = [/^@sentropic\/dataviz(-|$)/, /^@sentropic\/diagram-core$/,
  /^@sentropic\/diagram-codecs$/]` — `@sentropic/graph` and `@sentropic/diagram-canvas`
  match nothing, so 8 edges (4 fw → graph, 4 fw → diagram-canvas) are permitted.
  The plan's "four edges" is the graph half of that; the comment in the guard says eight.
  Both describe the same set. Test 3 walks `packages/<ds>/src` for
  `ts|tsx|svelte|js|mjs` sources importing the forbidden scopes (phantom-dependency walk).
- No edge is posed. Command:
  `grep -rn "@sentropic/graph" packages/components-svelte/ packages/components-react/`
  `packages/components-vue/ packages/components-angular/ apps/docs/ --exclude-dir=node_modules --exclude-dir=dist`
  returns **zero** matches (all four DS manifests and all four sources are clean).

## 2. What the DS already presents (the central question)

One node-edge renderer exists per framework, plus a standalone legend in three of them:

| framework | component | lines | layout origin today |
|---|---|---|---|
| svelte | `src/lib/ForceGraph.svelte` (+ `GraphLegend.svelte`) | 1431 | local `runSimulation`, O(n²) Coulomb + Hooke + gravity, seeded FNV-1a/mulberry32 |
| react | `src/ForceGraph.tsx` → re-export of `catalog.js` | 11 + catalog | local copy of the same simulation ("Svelte `stableSeed` so the three frameworks produce the SAME layout" — vue source comment) |
| vue | `src/ForceGraph.ts` (+ `GraphLegend.ts`) | 1421 | local port of the Svelte reference |
| angular | `src/ForceGraph.ts` (+ `GraphLegend.ts`) | 605 | local port ("ported from Svelte reference, no external dep") |

No d3, no xyflow, no external layout dependency anywhere: `grep -rn "d3\|xyflow" packages/components-*/src`
matches nothing layout-related. Positions come from **local computation**, not from the caller
(`fx`/`fy` pins excepted — all four honor pinned nodes, which the replacement must keep).

Consequence: the edge **replaces** an implementation. The lot deletes code; it must not leave two
active layout paths side by side.

Upstream already expects this exact replacement. `packages/graph/src/processing/graph-layout.ts`
header: "The physics mirror the legacy `ForceGraph` `runSimulation` (same constants and the same
FNV/mulberry32 deterministic seed) so pre-computed positions look like what the live component
would settle to". `computeLayout(nodes, edges, options)` is DOM-free, SSR-safe, and published under
the `./processing` subpath. This is the function the Svelte component delegates to.

Measured behavior delta (not zero — the mirror is approximate, and the spec records it):

| constant | DS local `runSimulation` | upstream `computeLayout` |
|---|---|---|
| repulsion factor | k² · 0.9 · clamp(repulsion) | k² · 0.6 · clamp(repulsion) |
| rest length | k · 0.8 | k · linkDistance(0.6 default) |
| spring K | 0.04 | 0.08 |
| gravity | 0.012 | 0.004 |
| repulsion solver | exact O(n²) | Barnes-Hut, theta 0.9 |
| node mass | uniform | ForceAtlas2-style 1 + degree |
| seed | FNV-1a over sorted ids → mulberry32 | identical scheme |

Reference output (fixture: 4 nodes a–b–c–d chain, `width:480 height:360 iterations:300 repulsion:1`,
`node ./packages/graph/dist/processing/index.js`, Node 22, ~5 ms):
`a (404.01, 358.51), b (295.21, 240.00), c (185.04, 119.75), d (76.47, 1.02)`.
Rendered positions **will change** versus the local simulation. That is accepted: the existing
`ForceGraph.test.ts` (1102 lines) asserts properties (node/edge counts, dimming, fit-to-content
framing, repulsion monotonicity, merge-callback protocol), never exact coordinates —
`grep -n "toBeCloseTo\|toMatchSnapshot"` matches only a shape-area assertion (line 428), no position.
No snapshot update is required; property tests must stay green unchanged.

## 3. Dependency cost (the figure behind the decision)

Built from source in this worktree (`npm run build --workspace=@sentropic/graph`), then:

- `packages/graph/dist/index.js` (root `.`): 165,099 B raw / 40,111 gzip
- `packages/graph/dist/processing/index.js` (`./processing`): 51,535 B raw / 12,472 gzip
- `packages/graph/dist/worker.js`: 9,292 B raw / 2,948 gzip
- `packages/graph/dist/layout-client.js`: 18,727 B raw / 4,936 gzip
- Tree-shaken + minified browser bundle of `import { computeLayout }` via the processing
  entry (esbuild, `bundle:true minify:true format:esm platform:browser`): **21,963 B raw /
  8,804 B gzip**. Same exercise through the root entry: 88,898 raw / 30,351 gzip (×3.4).

Decision (follows from the figure, reversible by a version bump):

- **Hard `dependencies` pin `"@sentropic/graph": "0.3.0"` (exact)** in
  `packages/components-svelte`. Exact pins are the repo convention for `@sentropic/*`
  cross-deps (`dataviz-svelte → dataviz-core "0.5.0"`, `→ design-system-svelte "0.35.0"`);
  0.3.0 is published, so `pack:smoke` cannot go red the way PR #65 did.
- **Import path restricted to `@sentropic/graph/processing`.** The root entry drags the
  WebGL renderer into every consumer for no reason (30 KB gzip vs 8.8 KB). Never the root.
- **Rejected: `peerDependencies` optional + local fallback.** It would keep the ~110-line local
  simulation alive as a second active path — the exact duplication this lot exists to remove —
  to save 8.8 KB gzip that the measurement shows is small.
- **Rejected: caller injection of the layout function.** It changes the public prop contract
  (a default-behavior decision), which is out of scope without an owner decision.
- `fx`/`fy` pin semantics, `iterations` default (300), and `repulsion` clamp [0.1, 10] are
  preserved verbatim: `computeLayout` implements all three with the same defaults, so no
  existing default changes.

## 4. Framework choice (one line)

Svelte: `apps/docs` is a SvelteKit site whose `components/force-graph` route already renders
`ForceGraph` from `@sentropic/design-system-svelte`, so the edge is demonstrable on a real page
with no new demo scaffolding.

## 5. Work items

1. `packages/components-svelte/package.json`: add `"@sentropic/graph": "0.3.0"` to
   `dependencies` (alphabetical). This also orders `scripts/run-workspaces.mjs` topologically,
   so `npm run build` builds `packages/graph/dist` (gitignored) before `svelte-package`,
   `svelte-check`, and vitest resolve the subpath.
2. `packages/components-svelte/src/lib/ForceGraph.svelte`: delete the local simulation block
   (`SimNode`, `mulberry32`, `stableSeed`, `runSimulation`, ~lines 336–485) and delegate:
   `computeLayout(nodes, edges, { width, height, iterations: ticks, repulsion })` → `Map`
   keyed by id. Update the stale `// Lightweight force simulation (no external dependency).`
   comment. Everything downstream (tone map, fit-to-content, edges, merge animation, selection)
   keeps consuming the `layout: Map<id, {x, y}>` unchanged.
3. Tests (same file, `ForceGraph.test.ts`): add an adapter block asserting the rendered node
   centres equal `computeLayout` reference output for identical inputs (pins the edge: a
   reintroduced local simulation with different physics fails it), plus pinned-node passthrough.
   No existing test is edited.
4. Proof in `dist`: `npm run build --workspace=@sentropic/design-system-svelte`, then
   `grep -rn "graph/processing" packages/components-svelte/dist/` shows the external import
   carried into the published `.svelte` + `.d.ts`; `npm run docs:build` proves the SvelteKit
   site still compiles and bundles against it.
5. Provenance: no entry. `tools/graph-dataviz-provenance/verify.mjs` covers six packages
   (`graph`, `dataviz-*`); `components-svelte` is not among them, and nothing is copied —
   the lot imports upstream, so there is no `sha256`/`destinationSha256` pair to record.
   The gate must still pass unchanged.

## 6. Explicitly out of scope

React / Vue / Angular edges (later lot, same pattern); `@sentropic/diagram-canvas`
(which does not exist yet); worker-thread layout (`layout-client`/`worker` subpaths —
the component stays synchronous, as today); the adaptive iteration budget
(`defaultLayoutIterations` — adopting it would change the `iterations` default);
any new repo guard (the existing `verify-layering` already permits this edge and walks
both manifests and sources; mechanizing further review criteria is out per the repo's
measured 18.2% review-cost lesson).

## 7. Gates (serial, on the final tree)

`npm ci` · `npm run build` · `npm run check` · `npm test` ·
`node --test scripts/*.test.mjs` · `npm run licensing:check` ·
`node tools/graph-dataviz-provenance/verify.mjs` — all rc=0, never two sequences in parallel.
