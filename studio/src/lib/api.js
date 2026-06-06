/**
 * Studio server client.
 *
 * The SPA is served BY `graphify ontology studio`; it fetches the live
 * graph.json and per-entity sidecar data (wiki description + occurrences) from
 * the same origin. These routes are added to `src/ontology-studio.ts`:
 *
 *   GET /api/ontology/scene.json          -> the light ForceGraph scene payload
 *   GET /api/ontology/graph.json          -> the raw graph.json payload
 *   GET /api/ontology/entity/<id>         -> { node, description, occurrences }
 *   GET /api/ontology/reconciliation/...  -> existing reconciliation JSON API
 *
 * When opened directly off the filesystem (no server), `fetchScene`/`fetchGraph`
 * fall back to `./scene.json` / `./graph.json` next to the bundle so the static
 * export still renders.
 */

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> ${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * ÉTAPE 1b: fetch the light ForceGraph `scene.json` — the mount payload. It is
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
    // Static-export fallback: a scene.json copied next to index.html.
    return getJson("./scene.json");
  }
}

export async function fetchGraph() {
  try {
    return await getJson("/api/ontology/graph.json");
  } catch (err) {
    // Static-export fallback: a graph.json copied next to index.html.
    return getJson("./graph.json");
  }
}

/**
 * Fetch the entity sidecar (description + occurrences) for a node id.
 * Returns null on any failure so the panel degrades to graph-only data.
 */
export async function fetchEntity(id) {
  try {
    return await getJson(`/api/ontology/entity/${encodeURIComponent(id)}`);
  } catch {
    return null;
  }
}

export async function fetchReconciliationCandidates() {
  try {
    return await getJson("/api/ontology/reconciliation/candidates?sort=score&order=desc&limit=50");
  } catch (err) {
    return { items: [], total: 0, error: String(err) };
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
