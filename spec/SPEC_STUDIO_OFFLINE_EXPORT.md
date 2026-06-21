# SPEC — Offline "Double-Click" Static Studio Export

## Status

**Target contract — NOT yet implemented.** This spec defines work-stream **A**: emit a self-contained
single-file `studio.html` that opens the Ontology Studio from a bare `file://` URL — a double-click,
no server, no static host. It restores the legacy `graph.html` double-click affordance that was
eradicated in #183 (`feat!: eradicate legacy vis-network graph.html — static Ontology Studio only`),
this time on the real DS-native ForceGraph studio.

The architecture study (`.graphify/scratch/STUDY_offline_studio.md`) **already decided the approach**.
This spec is the implementable contract derived from that decision and verified against the current
code. It is framed current-vs-target the way `SPEC_GRAPHIFY.md`'s *Enrichment Stages* section is:
every clause states what exists today (with `file:line` evidence) versus what must be built.

This spec goes through a **double-consensus review before any implementation**.

---

## Product Identity

`graphify studio export <out>` already produces a **multi-file static bundle** (`index.html` +
`assets/*.js,*.css` + `scene.json` + `graph.json` + `entities.json` + sidecars). That bundle works
over **HTTP** (a static file server, GitHub Pages, the live `graphify studio` server). It **does not**
work over `file://` — a user who double-clicks `index.html` gets a blank page.

The target adds, **alongside** the unchanged multi-file bundle, **one extra artifact**: a fully
self-contained `studio.html` that a user can double-click. JS, CSS, and the scene data are all inlined
into that single file; opening it triggers **zero** network requests on the first-paint path.

**Non-goal:** replacing or altering the multi-file/HTTP bundle. Server mode and GitHub Pages mode
remain **byte-for-byte unchanged** (see *Invariants*).

---

## The Problem — Two Independent `file://` Blockers

A `file://` page fails to load the current studio for **two distinct reasons**. Fixing one without the
other still yields a blank page; the design must clear **both**.

### Blocker 1 — ES-module CORS (`<script type="module">`)

`studio/index.html:11` boots the SPA with:

```html
<script type="module" src="./src/main.js"></script>
```

and the Vite build emits the same shape — a hashed `<script type="module" src="./assets/index-*.js">`
plus a `modulepreload`. Browsers apply CORS to **module scripts even from the same `file://` origin**:
every `file://` is treated as an *opaque origin*, and a module fetch from an opaque origin is blocked.
The console shows `Access to script at 'file://…' from origin 'null' has been blocked by CORS policy`.
Classic (non-module) scripts are exempt, but the studio is ESM. **Inlining the JS into the HTML is the
only robust fix** — there is no script to fetch, so there is nothing to block.

### Blocker 2 — `fetch()` CORS (the data layer)

Even with the JS inlined, the running app fetches its data. `studio/src/lib/api.js` is the single data
client; every accessor calls `getJson(url)` → `fetch(url, …)` (`studio/src/lib/api.js:24-28`). The
static-export fallbacks resolve **relative** paths next to the page:

- `fetchScene()` → `getJson(staticPath("scene.json"))` (`api.js:72-80`)
- `fetchGraph()` → `getJson(staticPath("graph.json"))` (`api.js:82-90`)
- `fetchEntity(id)` → `loadEntitiesIndex()` → `getJson(staticPath("entities.json"))` (`api.js:102-130`)
- plus `class-hierarchies.json`, `reconciliation-candidates.json`, `models.json` (`api.js:137-177`)

`fetch()` of a `file://` URL from an opaque origin is **blocked by the same CORS rule**: it rejects with
a `TypeError: Failed to fetch` (no HTTP status). The first-paint accessor — `fetchScene()` — therefore
rejects, `loadWorkspace` falls through to `fetchGraph()` which also rejects, and `loadWorkspace`
returns `{ mode: "error" }` (`studio/src/lib/sceneLoader.js:25-58`). The graph view never paints.

**Both blockers are real and independent.** Blocker 1 is fixed by inlining JS/CSS. Blocker 2 is fixed by
inlining the **data** and short-circuiting `fetch` to read it from memory.

---

## The Decided Design (do not re-litigate)

Emit — **in addition to** the existing multi-file bundle, which stays unchanged — a single
`studio.html` that:

1. **Inlines JS + CSS** into the HTML via `vite-plugin-singlefile`, producing an HTML with no external
   `<script src>` / `<link href>` (clears Blocker 1).
2. **Inlines the scene data** as a global `window.__GRAPHIFY_BUNDLE__`, set by an inline classic
   `<script>` placed **before** the app's module script, so it exists before mount (clears Blocker 2,
   data side).
3. **Short-circuits `fetch` in `api.js`**: a new in-memory-bundle check runs **before every `fetch`**
   (mirroring the existing `staticBaseProvider` seam, `api.js:42-62`). When the inlined bundle holds a
   key, the accessor returns it synchronously-resolved — **no `fetch` is issued** (clears Blocker 2,
   read side, and guarantees the no-fetch invariant).

This is **DEFAULT-ON**: a normal default studio emit produces `studio.html` next to the multi-file
bundle, restoring the double-click affordance without a flag.

### Why both inlining + short-circuit (not just inlining)?

Inlining `window.__GRAPHIFY_BUNDLE__` is necessary but **not sufficient**: today nothing reads it.
`api.js` would still call `fetch`, which still rejects over `file://`. The short-circuit in `api.js` is
what makes the inlined data actually *load* the graph. Conversely, the short-circuit without inlined data
has nothing to return. **Both halves are mandatory.**

---

## The Contract

### C1 — `graphify studio export <out>` and the default emit

| Surface | Today | Target |
| --- | --- | --- |
| `graphify studio export <out>` | Emits the multi-file bundle (`src/cli.ts:4457-4486`, `src/studio-export.ts:159-330`). | **Also** emits `<out>/studio.html` (single-file, scene-inlined) by default. Multi-file bundle unchanged. |
| Default emit (`emitDefaultStaticStudio`) | Writes `<stateDir>/studio/` multi-file (`src/cli.ts:257-288`). | **Also** writes `<stateDir>/studio/studio.html`. Restores the double-click affordance. |
| `--full-offline` | n/a | Inline `graph.json` + `entities.json` into the bundle too (not just `scene.json`). |
| `--no-single-file` | n/a | Skip `studio.html`; emit only the multi-file bundle (escape hatch / smaller output). |

`buildStaticStudio()` (`src/studio-export.ts:159`) is the engine for both surfaces; the single-file emit
is added there so `studio export` and the default path share one code path. `BuildStaticStudioOptions`
(`src/studio-export.ts:58-72`) gains `singleFile?: boolean` (default `true`) and `fullOffline?: boolean`
(default `false`); the CLI maps `--no-single-file` → `singleFile: false` and `--full-offline` →
`fullOffline: true`. `BuildStaticStudioResult` (`src/studio-export.ts:74-87`) gains the emitted
`studio.html` path and its byte size for the CLI summary and tests.

### C2 — The single-file build (clears Blocker 1)

- The studio Vite build (`studio/vite.config.js`) gains a **single-file variant gated by a build env
  flag** (e.g. `GRAPHIFY_STUDIO_SINGLEFILE=1`), adding `vite-plugin-singlefile` **only** when the flag
  is set. The default `npm run build` keeps emitting the **multi-file** server bundle (the artifact
  `resolveStudioAppDir()` resolves, `src/studio-assets.ts:62-72`) byte-unchanged. The flag is the gate
  that **preserves the multi-file server build**.
- `vite-plugin-singlefile` is **not currently a dependency** (`studio/package.json` has no
  `vite-plugin-singlefile`; `node_modules` confirms ABSENT) — it must be added as a dev dependency.
- The single-file build produces an HTML with **no external `<script src>` and no `<link href>`**: all
  JS and CSS are inlined. This is the template the exporter injects the data script into to produce
  `studio.html`.
- **Build wiring (current-vs-target):** today the prebuilt SPA is produced once and resolved at export
  time from disk (`resolveStudioAppDir()`). The export step does not run Vite. The single-file template
  must therefore be **produced at SPA-build time** (a second Vite output, gated by the flag) and resolved
  by the exporter the same way the multi-file `index.html` is — NOT built on the fly inside
  `buildStaticStudio`. The exporter takes the prebuilt single-file HTML, injects the data `<script>`,
  and writes `studio.html`. (If the single-file template is absent on disk, the single-file emit is a
  warned no-op, exactly like the existing `StudioSpaNotBuiltError` best-effort posture,
  `src/cli.ts:274-282`.)

### C3 — Data inlining (`window.__GRAPHIFY_BUNDLE__`)

The exporter injects, into the single-file HTML, an inline **classic** `<script>` placed **before** the
app's (inlined) module script:

```html
<script>window.__GRAPHIFY_BUNDLE__ = JSON.parse("…escaped JSON string…");</script>
```

- The bundle is a **map keyed by the same filenames the static fallbacks request**, so the seam in
  `api.js` can look up `scene.json`, `graph.json`, `entities.json`, etc. by their existing keys.
- **Scene-only by default.** The default bundle inlines **only `scene.json`** (the light first-paint
  payload). With `--full-offline`, it **also** inlines `graph.json` and `entities.json`.
- **`JSON.parse` of an escaped string, not a raw object literal.** Emitting the JSON as a bare object
  literal (`window.__GRAPHIFY_BUNDLE__ = {…}`) forces the browser to parse multi-MB of JSON as
  JavaScript source — measurably slower and memory-heavier than `JSON.parse` of a string literal. The
  inlined form is a **single string** passed to `JSON.parse`.

#### C3a — Mandatory escaping (security + correctness)

The JSON-string content is interpolated into HTML inside a `<script>` and inside a JS string literal.
The exporter MUST escape, at minimum:

- **`</` → `<\/`** (so a `</script>` substring in any inlined value cannot close the script element
  early — an HTML-context break that would corrupt the page and is an injection vector).
- **`U+2028` (LINE SEPARATOR) and `U+2029` (PARAGRAPH SEPARATOR)** → ` ` / ` `. These are valid
  in JSON strings but are **line terminators in JavaScript**; unescaped, they break the surrounding JS
  string literal and throw a `SyntaxError` at load.
- The usual JS-string escapes for the chosen quoting (backslash, the quote char). Emitting via
  `JSON.stringify` of the already-stringified JSON (double-encode), then post-replacing `</`, `U+2028`,
  `U+2029`, yields a safe, parseable literal.

This escaping is **non-optional**: skipping it is a correctness bug (random graphs fail to load) AND a
content-injection vector. It is a named test obligation (T4).

#### C3b — Scene-must-carry-positions gotcha

The inlined `scene.json` MUST be the **position-bearing** scene — the `attachLayoutPositions(...)` output
the multi-file export already writes (`src/studio-export.ts:254-257`), carrying `x,y` (+ `fx,fy` pins).
A scene **without** positions renders as a degenerate circle / forces an O(n²) client re-layout at mount
on `file://` (the very failure mode flagged in `project_mystery_validated_graph` and
`project_studio_chantiers`). The single-file bundle reuses the **same** position-bearing scene bytes the
multi-file export emits — it does not recompute or strip positions. (This is automatic if the exporter
inlines the same `scene` object it writes to `scene.json`; the spec states it so the test can assert it.)

### C4 — The `api.js` short-circuit seam (clears Blocker 2)

A new in-memory-bundle check is added to `api.js`, checked **before each `fetch`**, mirroring the
existing `staticBaseProvider` indirection (`api.js:42-62`):

- A helper — e.g. `bundleGet(file)` — reads `window.__GRAPHIFY_BUNDLE__?.[staticPath-key for file]` and
  returns the value (or a sentinel "absent") **without touching the network**.
- Each accessor that has a static fallback (`fetchScene`, `fetchGraph`, `loadEntitiesIndex`/`fetchEntity`,
  `fetchClassHierarchies`, `fetchReconciliationCandidates`, `fetchModelsManifest`) consults `bundleGet`
  **before** issuing any `fetch` — both the same-origin server route **and** the static fallback. When the
  bundle holds the key, the accessor resolves from memory and **no `fetch` is issued at all**.
- **No-fetch-on-first-paint invariant:** on the `file://` first-paint path, `fetchScene()` MUST resolve
  from `window.__GRAPHIFY_BUNDLE__` with **zero** network requests. Because `loadWorkspace`
  (`sceneLoader.js:25-44`) paints from the scene and lazy-loads the graph in the background, scene-only
  bundles paint the graph with no fetch; in scene-only mode the background `fetchGraph()` may have no
  inlined `graph.json` and will attempt a `file://` fetch that fails **harmlessly** (it is off the
  render-critical path and already null-tolerant, `sceneLoader.js:36-43`). To keep the *first-paint*
  path fetch-clean and avoid a console error, scene-only mode SHOULD make the absent-key `fetchGraph()`
  short-circuit to a resolved-null instead of a doomed `file://` fetch. **`--full-offline` eliminates the
  failing background fetch entirely** by inlining `graph.json` + `entities.json`.
- **Ordering guarantee:** `window.__GRAPHIFY_BUNDLE__` is set by the inline script **before** the module
  script runs, so it is present before `mount(App)` (`studio/src/main.js`) and before
  `onMount → loadActiveModel → loadWorkspace` (`studio/src/App.svelte:209-214`). No race.
- **Seam parity:** the multi-model `staticBaseProvider` path (`api.js:45-62`) is preserved. The bundle
  lookup composes with it: in a single-model offline bundle the base is null and keys are flat
  (`scene.json`); the seam does not regress multi-model HTTP bundles.

### C5 — Size budget (measured, real bytes)

Measured from real exports in this repo:

| Corpus | scene.json | graph.json | entities.json | JS+CSS |
| --- | --- | --- | --- | --- |
| mystery (~2092 nodes) | ~0.96 MB | ~2.62 MB | ~0.13 MB | ~0.19 MB |
| docs/studio (large) | ~2.51 MB | ~6.51 MB | ~0.62 MB | ~0.20 MB |

- **Scene-only `studio.html`** ≈ scene.json + JS/CSS + HTML shell ≈ **~2.7 MB** for the docs corpus
  (~1.2 MB for mystery). This is the default and matches the study's ~2.7 MB figure.
- **`--full-offline` `studio.html`** additionally inlines graph.json + entities.json ≈ **~9.8 MB** for
  the docs corpus (~3.7 MB for mystery).
- JSON double-encoding adds modest escaping overhead (the string is the JSON plus escapes); the budget is
  dominated by the data. The size assertions in T3 use **scene-only < full-offline** and a generous
  absolute ceiling rather than brittle exact bytes.

---

## Invariants (MUST hold)

- **INV-1 — No fetch on first paint over `file://`.** A double-clicked `studio.html` renders the graph
  with **zero blocked/failed network requests on the first-paint path**. (Background graph hydration in
  scene-only mode must not emit a failed `file://` fetch — see C4.)
- **INV-2 — Server/Pages mode byte-unchanged.** The multi-file bundle (`index.html` + `assets/` + the
  `GENERATED_DATA_FILES` of `src/studio-export.ts:89-102`) is **byte-identical** to today. The live
  `graphify studio` server and the GitHub Pages flow consume the multi-file bundle and are untouched. The
  single-file output is purely additive.
- **INV-3 — Default-on, best-effort.** The single-file emit runs by default and is **best-effort**: a
  missing single-file template (or any single-file-only failure) warns and is a no-op, exactly like the
  existing `StudioSpaNotBuiltError` posture (`src/cli.ts:274-282`); it never fails the surrounding graph
  rebuild.
- **INV-4 — Multi-file build preserved by the env flag.** The single-file Vite output is gated by the
  build env flag; the default build still emits the multi-file server bundle. The two builds are distinct
  artifacts; neither overwrites the other.

---

## In Scope

- `vite-plugin-singlefile` dev dependency + flag-gated single-file Vite variant in `studio/vite.config.js`.
- A second prebuilt SPA artifact (the single-file HTML template) resolved by the exporter alongside the
  multi-file `index.html`.
- `buildStaticStudio` emit of `<out>/studio.html`: inline the position-bearing scene (and, with
  `--full-offline`, graph + entities) as an escaped `window.__GRAPHIFY_BUNDLE__`, default-on.
- `--full-offline` and `--no-single-file` flags on `graphify studio export`; option plumbing through
  `BuildStaticStudioOptions` / `BuildStaticStudioResult` and the default emit path
  (`emitDefaultStaticStudio`).
- The `api.js` bundle short-circuit seam (`bundleGet` + per-accessor pre-fetch check) and the scene-only
  `fetchGraph` resolved-null behavior.
- The mandatory `</script>` + `U+2028`/`U+2029` JSON-string escaping.

## Deferred / Out of Scope

- **Compression** of the inlined data (gzip/brotli into a `<script>`-decoded blob). The budget is
  acceptable uncompressed; compression is a later size optimization.
- **Multi-model offline bundles** in a single `studio.html` (today's multi-model story is HTTP via
  `models/<id>/`; the seam stays compatible but a single-file multi-model bundle is deferred).
- **Write/patch routes** offline. `postPatch*` (`api.js:185-197`) require a loopback `--write` server and
  are inherently non-`file://`; they are unreachable offline and out of scope. The studio degrades to
  read-only offline (acceptable; the offline studio is a viewer).
- Any change to enrichment, scene construction, layout, or sidecar logic — this work-stream is purely
  packaging/transport.

---

## Test Obligations

These are the acceptance gates; double-consensus review checks them against the implementation.

- **T1 — `file://` renders with ZERO blocked/failed requests (INV-1).** Load the emitted `studio.html`
  from a real `file://` URL (headless browser / CDP). Assert: the graph renders (nodes painted), and the
  network log shows **no blocked and no failed requests on the first-paint path**. This is the
  end-to-end proof that both blockers are cleared.
- **T2 — Bundle short-circuit returns inlined data without fetch (C4).** Unit-test the `api.js` seam with
  `window.__GRAPHIFY_BUNDLE__` populated and `fetch` stubbed to throw/spy. Assert `fetchScene()` (and,
  in full-offline, `fetchGraph()`/`fetchEntity()`) resolve from the bundle and `fetch` is **never
  called**. Mirror the existing `__resetStaticBaseProvider` / `__resetEntitiesIndexCache` test seams
  (`api.js:50-52,112-116`) with a bundle-reset seam.
- **T3 — Size assertions (C5).** Assert the scene-only `studio.html` is smaller than the `--full-offline`
  one, the scene-only file is under a generous ceiling, and the full-offline file's size minus scene-only
  ≈ graph.json + entities.json bytes (data was actually inlined). Use relative/ceiling assertions, not
  exact byte equality.
- **T4 — Escaping correctness (C3a).** Feed a scene whose values contain a literal `</script>` substring,
  a `U+2028`, and a `U+2029`. Assert the emitted `studio.html` parses (no `SyntaxError`), the script
  element is not closed early, and the round-tripped `window.__GRAPHIFY_BUNDLE__` deep-equals the input
  scene.
- **T5 — Positions preserved (C3b).** Assert the inlined scene carries `x,y` (and `fx,fy` where the
  multi-file `scene.json` has them) — byte-identical to the `scene.json` the multi-file export writes
  for the same input. Guards the degenerate-circle regression.
- **T6 — Server/Pages bundle unchanged (INV-2).** Assert the multi-file emit (`index.html` + `assets/` +
  every `GENERATED_DATA_FILES` entry) is byte-identical with single-file emit on vs `--no-single-file`;
  the only difference is the **presence** of the additive `studio.html`. A snapshot/diff of the
  multi-file artifacts must show no change.
- **T7 — Flag plumbing.** `--no-single-file` omits `studio.html` (multi-file unchanged). `--full-offline`
  inlines graph + entities (T2/T3 confirm). Default (no flags) emits scene-only `studio.html`.

---

## Evidence Index (current code the spec is anchored to)

- `studio/index.html:11` — the module-script boot (Blocker 1).
- `studio/vite.config.js` — multi-file build; no single-file plugin (target adds flag-gated variant).
- `studio/src/lib/api.js:24-28` — `getJson` → `fetch` (the single data chokepoint).
- `studio/src/lib/api.js:42-62` — `staticBaseProvider` seam the short-circuit mirrors.
- `studio/src/lib/api.js:72-177` — the static-fallback accessors that get the bundle pre-check.
- `studio/src/lib/sceneLoader.js:25-58` — scene-first / lazy-graph load policy; error mode if both fail.
- `studio/src/main.js`, `studio/src/App.svelte:209-214` — mount → `loadWorkspace`; ordering for the
  inline data script.
- `src/studio-export.ts:159-330` — `buildStaticStudio` engine; `:254-257` position-bearing scene;
  `:89-102` `GENERATED_DATA_FILES`; `:58-87` options/result to extend.
- `src/cli.ts:257-288` — `emitDefaultStaticStudio` (default-on path); `:4457-4486` — `studio export`
  command to extend with the two flags.
- `src/studio-assets.ts:62-72` — `resolveStudioAppDir` (how the exporter resolves the prebuilt SPA;
  the single-file template is resolved the same way).
- Measured byte sizes: `.graphify/scratch/mystery-studio*/` and `docs/studio/` exports (see C5 table).
