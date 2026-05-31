# Graphify Ontology Studio — client Svelte SPA

A reactive Svelte 5 + Vite single-page app for the ontology studio. The central
graph is the **published** `@sentropic/design-system-svelte` `ForceGraph`
component (autonomous force simulation, no d3). Clicking a node highlights it and
opens the right-hand entity panel **without reloading or re-laying-out the
graph** — selection flows through the DS `selectedIds` / `focusId` props.

## ForceGraph import

The package only exports `.` (its root `dist/index.js`); there is **no**
`./ForceGraph.svelte` subpath export. Use the documented named export:

```js
import { ForceGraph } from "@sentropic/design-system-svelte";
```

## Architecture (mirrors the process-std-am viewer)

- `src/App.svelte` — one client `viewerState` (`selectedIds`, `focusId`,
  `activeView`, `filters`); `$derived` scene rebuilt from the fetched
  `graph.json`. The scene is recomputed only on graph / weak-link changes, never
  on selection.
- `src/lib/graphAdapter.js` — pure `GraphLike -> ForceGraph` mapping
  (`community_name || community || type -> group`, degree -> `weight`,
  `confidence !== "EXTRACTED" -> weak`). Unit-tested in `src/tests/`.
- `src/lib/viewerState.js` — state factory + transitions.
- `src/lib/api.js` — fetches `/api/ontology/graph.json` and
  `/api/ontology/entity/<id>` from the studio server.
- `src/components/` — `WorkspaceShell` (3 columns), `LeftRail`
  (Types/Facets/Results/Communities accordions), `GraphCanvas` (wraps
  `ForceGraph`), `EntityPanel` (wiki description + relations),
  `ReconciliationView` (stub).

## Theme / tokens

`src/app.css` imports `@sentropic/design-system-themes/css/entropic.css`, which
sets every `--st-*` token under `[data-st-theme="entropic"]`. `App.svelte` puts
that attribute on the shell root, so both the DS `ForceGraph` and the app shell
resolve the same token set.

## Build & serve

```bash
npm install            # in this studio/ dir (its own node_modules)
npm run build          # -> studio/dist (static assets, base "./")
```

The built SPA is served by `graphify ontology studio` from **`/studio/`**:

- The repo-root `npm run build:studio` builds this app and copies
  `studio/dist` -> `dist/studio-app` (next to the compiled server). The root
  `npm run build` chains it after `tsup`.
- At runtime `src/studio-assets.ts#resolveStudioAppDir` locates the SPA
  (`dist/studio-app` published, or `studio/dist` from source) and serves it.
  `/studio` 308-redirects to `/studio/` so the relative asset URLs resolve.

Server routes added (in `src/ontology-studio.ts`):

| Route | Purpose |
| --- | --- |
| `GET /studio/` | the SPA (static assets) |
| `GET /api/ontology/graph.json` | raw graph.json the SPA renders |
| `GET /api/ontology/entity/<id>` | wiki description + occurrences for an entity |

The legacy server-rendered studio at `/` is untouched — the two coexist.

## What remains (follow-ups)

- **Reconciliation**: `ReconciliationView` is a first-slice stub (lists
  candidates from the live API, jumps to the canonical entity). The full
  candidate workbench (compare block, evidence/audit drawer, patch apply via the
  existing `/api/ontology/patch/*` write routes) is not yet ported.
- **Tokens polish**: only the `entropic` theme is wired; theme switching and the
  DS `ThemeProvider` (vs. raw CSS import) are not yet exposed.
- **Group filtering**: the rail filters the Results list by type/community; the
  center graph is not yet sliced to the active group (BFS focus subgraph from
  `graph-selection.ts` is the intended next step).
