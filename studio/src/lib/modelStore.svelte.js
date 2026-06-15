/**
 * In-UI model switcher store.
 *
 * The studio can be built as a SINGLE multi-model bundle: one studio SPA whose
 * data files live under `./models/<id>/` (scene.json, graph.json, entities.json,
 * reconciliation-candidates.json), plus a top-level `./models.json` manifest
 * describing which model re-indexations are available. The header dropdown lets
 * a human flip the SAME studio between models and re-render the graph IN PLACE.
 *
 * This module is the single source of truth for "which model is active" and
 * "where do data fetches resolve". It is a plain reactive holder (Svelte 5
 * runes), kept framework-thin and fully unit-testable: the active id and the
 * fetch base are derived from a loaded manifest, never hardcoded.
 *
 * Manifest shape (`models.json`, version 1):
 *   {
 *     "version": 1,
 *     "default": "opus-4.8xh",          // optional; else first model
 *     "models": [
 *       { "id": "opus-4.8xh",
 *         "label": "Claude Opus 4.8 (extended thinking)",
 *         "nodeCount": 1558,            // optional, shown in the option
 *         "path": "models/opus-4.8xh"   // optional; defaults to models/<id>
 *       },
 *       { "id": "sonnet-4.6", "label": "Claude Sonnet 4.6", "nodeCount": 768 }
 *     ]
 *   }
 *
 * To add mistral/gpt/agy later: drop their data dir under `models/<id>/` and add
 * one entry to the `models` array. No code change — the switcher is data-driven.
 */

/** Normalise one manifest entry into a stable model descriptor. */
function normaliseModel(entry) {
  if (!entry || typeof entry.id !== "string" || !entry.id) return null;
  const id = entry.id;
  return {
    id,
    label: typeof entry.label === "string" && entry.label ? entry.label : id,
    nodeCount: Number.isFinite(entry.nodeCount) ? entry.nodeCount : null,
    // Trailing-slash-free base, relative to the bundle root (index.html dir).
    base: (typeof entry.path === "string" && entry.path ? entry.path : `models/${id}`).replace(/\/+$/, ""),
  };
}

/**
 * Parse a raw `models.json` document into { models, defaultId }. Tolerant: drops
 * malformed entries, falls back to the first model when `default` is absent or
 * unknown. Returns an empty list (no default) when nothing is usable.
 * @param {unknown} doc
 */
export function parseManifest(doc) {
  const rawModels = doc && Array.isArray(doc.models) ? doc.models : [];
  const models = rawModels.map(normaliseModel).filter(Boolean);
  let defaultId = null;
  if (models.length > 0) {
    const wanted = doc && typeof doc.default === "string" ? doc.default : null;
    defaultId = wanted && models.some((m) => m.id === wanted) ? wanted : models[0].id;
  }
  return { models, defaultId };
}

/** Resolve the bundle-relative fetch base (no trailing slash) for a model id. */
export function modelBase(models, id) {
  const found = models.find((m) => m.id === id);
  return found ? found.base : null;
}

/**
 * The reactive model-switch store. `models` + `activeId` drive everything; the
 * `base()` getter is what api.js consults to resolve `<base>/scene.json` etc.
 * A `null` base means "no manifest / single-bundle mode" — api.js then keeps its
 * legacy `./scene.json` (server or flat static export) behaviour unchanged.
 */
export function createModelStore() {
  let models = $state.raw([]);
  let activeId = $state(null);

  return {
    get models() {
      return models;
    },
    get activeId() {
      return activeId;
    },
    get active() {
      return models.find((m) => m.id === activeId) ?? null;
    },
    /**
     * Bundle-relative base for the ACTIVE model, e.g. "models/opus-4.8xh".
     * `null` when no model is loaded (legacy flat / server mode).
     */
    get base() {
      const found = models.find((m) => m.id === activeId);
      return found ? found.base : null;
    },
    /** Load a parsed manifest; selects the default (or first) model. */
    setManifest(doc) {
      const parsed = parseManifest(doc);
      models = parsed.models;
      activeId = parsed.defaultId;
      return parsed;
    },
    /** Switch the active model. No-op (returns false) for an unknown id. */
    select(id) {
      if (!models.some((m) => m.id === id)) return false;
      if (id === activeId) return false;
      activeId = id;
      return true;
    },
  };
}
