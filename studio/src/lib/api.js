/**
 * Studio server client.
 *
 * The SPA is served BY `graphify ontology studio`; it fetches the live
 * graph.json and per-entity sidecar data (wiki description + occurrences) from
 * the same origin. These routes are added to `src/ontology-studio.ts`:
 *
 *   GET /api/ontology/scene.json          -> the light Studio scene payload
 *   GET /api/ontology/graph.json          -> the raw graph.json payload
 *   GET /api/ontology/entity/<id>         -> { node, description, occurrences }
 *   GET /api/ontology/reconciliation/...  -> existing reconciliation JSON API
 *
 * When opened directly off the filesystem (no server), every fetch falls back to
 * a static file copied next to the bundle so the standalone export still works:
 *   fetchScene                     -> ./scene.json
 *   fetchGraph                     -> ./graph.json
 *   fetchEntity(id)                -> ./entities.json  (a single { id: sidecar }
 *                                     index, fetched once then served from cache;
 *                                     1193 per-entity files are avoided because
 *                                     most sidecars are empty in the demo)
 *   fetchReconciliationCandidates  -> ./reconciliation-candidates.json
 */

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> ${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * Model-aware static base (multi-model bundle support).
 *
 * In a multi-model bundle each model's data files live under `./models/<id>/`,
 * and the in-UI switcher flips the active model. The studio registers a provider
 * here (driven by the model store) so the static-export fetch fallbacks resolve
 * `<base>/scene.json` instead of the flat `./scene.json`. When no provider is
 * set, or it returns a falsy base, EVERY path below behaves exactly as before
 * (server route first, then flat `./scene.json`) — single-model bundles and the
 * live server are completely unaffected.
 * @type {(() => string|null)|null}
 */
let staticBaseProvider = null;

/** Register the active-model base provider (a function returning e.g. "models/opus" or null). */
export function setStaticBaseProvider(fn) {
  staticBaseProvider = typeof fn === "function" ? fn : null;
}

/** Test seam: clear the registered base provider. */
export function __resetStaticBaseProvider() {
  staticBaseProvider = null;
}

/**
 * Resolve a bundle-relative static file path for the ACTIVE model. With a base
 * "models/opus" and file "scene.json" -> "./models/opus/scene.json". With no
 * active base -> the legacy flat "./scene.json".
 */
function staticPath(file) {
  const base = staticBaseProvider ? staticBaseProvider() : null;
  return base ? `./${base}/${file}` : `./${file}`;
}

/**
 * ÉTAPE 1b: fetch the light Studio `scene.json` — the mount payload. It is
 * the build/server-side `buildStudioScene(graph)` output (a few hundred KB)
 * rather than the multi-MB raw graph.json, so first paint no longer waits on the
 * full graph or recomputes the scene client-side. Rejects when neither the API
 * route nor the static-export copy is reachable; the caller then falls back to
 * the legacy `fetchGraph()` + `buildScene()` path.
 */
export async function fetchScene() {
  try {
    return await getJson("/api/ontology/scene.json");
  } catch (err) {
    // Static-export fallback: a scene.json next to index.html (or under the
    // active model's dir in a multi-model bundle).
    return getJson(staticPath("scene.json"));
  }
}

export async function fetchGraph() {
  try {
    return await getJson("/api/ontology/graph.json");
  } catch (err) {
    // Static-export fallback: a graph.json next to index.html (or under the
    // active model's dir in a multi-model bundle).
    return getJson(staticPath("graph.json"));
  }
}

/**
 * Standalone fallback: a single `./entities.json` index of { id: sidecar }.
 * Fetched at most once (the in-flight promise is memoised); a missing file or
 * parse error caches `null` so we never retry on every selection.
 * @type {Promise<Record<string, object>|null>|undefined}
 */
let entitiesIndexPromise;
/** The static path the memoised index was loaded for; reload on model switch. */
let entitiesIndexKey;

function loadEntitiesIndex() {
  const url = staticPath("entities.json");
  // Re-fetch when the active model (and thus the path) changed.
  if (entitiesIndexPromise === undefined || entitiesIndexKey !== url) {
    entitiesIndexKey = url;
    entitiesIndexPromise = getJson(url).catch(() => null);
  }
  return entitiesIndexPromise;
}

/** Test seam: drop the memoised entities index so each test starts clean. */
export function __resetEntitiesIndexCache() {
  entitiesIndexPromise = undefined;
  entitiesIndexKey = undefined;
}

/**
 * Fetch the entity sidecar (description + occurrences) for a node id. Tries the
 * server route first, then the standalone `./entities.json` index. Returns null
 * on any failure so the panel degrades to graph-only data.
 */
export async function fetchEntity(id) {
  try {
    return await getJson(`/api/ontology/entity/${encodeURIComponent(id)}`);
  } catch {
    const index = await loadEntitiesIndex();
    return index?.[id] ?? null;
  }
}

/**
 * Multi-model bundle manifest (`./models.json`, top-level next to index.html).
 * Resolves `null` when absent — the studio then runs in single-model mode and
 * the switcher is hidden. Never throws.
 */
export async function fetchModelsManifest() {
  try {
    return await getJson("./models.json");
  } catch {
    return null;
  }
}

export async function fetchReconciliationCandidates() {
  try {
    return await getJson("/api/ontology/reconciliation/candidates?sort=score&order=desc&limit=50");
  } catch (err) {
    try {
      // Standalone fallback: a candidates response next to index.html (or under
      // the active model's dir in a multi-model bundle).
      return await getJson(staticPath("reconciliation-candidates.json"));
    } catch {
      return { items: [], total: 0, error: String(err) };
    }
  }
}

/**
 * POST a patch to one of the write routes. On a loopback --write server no
 * bearer token is required (SVELTE-7); the server applies/validates the patch.
 * @param {"validate"|"dry-run"|"apply"} route
 * @param {object} patch  a graphify_ontology_patch_v1 document
 */
export async function postPatch(route, patch) {
  const res = await fetch(`/api/ontology/patch/${route}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(patch),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, ...data };
}

export const postPatchValidate = (patch) => postPatch("validate", patch);
export const postPatchDryRun = (patch) => postPatch("dry-run", patch);
export const postPatchApply = (patch) => postPatch("apply", patch);
