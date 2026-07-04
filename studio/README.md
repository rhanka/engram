# Graphify Ontology Studio — client Svelte SPA

A reactive Svelte 5 + Vite single-page app for the ontology studio. The central
graph renders through the local `@sentropic/graph` canvas/WebGL renderer.
Clicking a node highlights it and opens the right-hand entity panel **without
reloading or re-laying-out the graph** — selection flows through the Studio
`selectedIds` / `focusId` state.

## Graph renderer import

The Studio Vite config aliases `@sentropic/graph` to the local package source so
the published SPA bundles the renderer being developed in this repo:

```js
import { createGraphRenderer } from "@sentropic/graph";
```

## Architecture (mirrors the process-std-am viewer)

- `src/App.svelte` — one client `viewerState` (`selectedIds`, `focusId`,
  `activeView`, `filters`); `$derived` scene rebuilt from the fetched
  `graph.json`. The scene is recomputed only on graph / weak-link changes, never
  on selection.
- `src/lib/graphAdapter.js` — pure `GraphLike -> Studio scene` mapping
  (`community_name || community || type -> group`, degree -> `weight`,
  `confidence !== "EXTRACTED" -> weak`). Unit-tested in `src/tests/`.
- `src/lib/graphRendererPayload.js` — maps the Studio scene to
  `@sentropic/graph` render/style buffers.
- `src/lib/viewerState.js` — state factory + transitions.
- `src/lib/api.js` — fetches `/api/ontology/graph.json` and
  `/api/ontology/entity/<id>` from the studio server.
- `src/components/` — `WorkspaceShell` (3 columns), `LeftRail`
  (Types/Facets/Results/Communities accordions), `GraphCanvas` (wraps
  `@sentropic/graph`), `EntityPanel` (wiki description + relations),
  `ReconciliationView` (stub).

## Theme / tokens

`src/app.css` imports `@sentropic/design-system-themes/css/entropic.css`, which
sets every `--st-*` token under `[data-st-theme="entropic"]`. `App.svelte` puts
that attribute on the shell root, so the DS shell components and local canvas
renderer resolve the same token set.

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

## Cited-source viewer (INTERIM, architect-ratified §S.5)

`components/CitedSourceViewer.svelte` is the app-local interim build of the
future `@sentropic/cited-source-viewer` package. Contract:

- **Pure component** (mechanical-rebase seam): props are
  `refs: CitedSourceRef[]` + `resolveSource(ref) => Promise<{kind:"pdf",data}|{kind:"markdown",text}>`
  (+ `activeIndex`, `title`, `onClose`). It imports ONLY `lib/cited-source/*`
  (quote matcher lifted from radar `pdf-citation-match.ts`, pdf.js engine seeded
  from radar `SignalPdfOverlay.svelte`) and Svelte — **no graphify import**.
- **Impure glue** lives in `lib/citedSources.js` + `App.svelte`: converts
  `node.citations` via the frozen public projection
  (`citationToCitedSourceRef`, `src/cited-source-refs.ts`), fills the
  `source_file` locator, and resolves bytes.
- **v1 scope**: MD/OCR-markdown/plain-text + PDF text-layer. No DOCX/PPTX (v2),
  no image-bbox (v3).

### Source-byte resolution (distribution pathing)

`graphify studio export <out> --include-sources` copies every cited file into
`<out>/sources/<project-relative source_file>` (opt-in, only files actually
referenced by citations; `--sources-root` overrides the project root, default =
parent of `--state`). The SPA glue fetches `./sources/<source_file>` relative to
the bundle.

What works where:

| Mode | Viewer |
| --- | --- |
| Served multi-file bundle (any static server / Pages) | **Full**: PDF render + text-layer highlight, markdown highlight |
| Live `graphify ontology studio` server | Panel affordance shows; sources 404 (no `/api` source route yet — follow-up) |
| `file://` (double-clicked `studio.html` / `index.html`) | Viewer opens, shows its explicit "Source unavailable" state (browser blocks sibling `file://` fetches; pdf.js worker cannot load either) |
