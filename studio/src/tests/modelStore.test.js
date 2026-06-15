import { afterEach, describe, expect, it, vi } from "vitest";

import { createModelStore, parseManifest, modelBase } from "../lib/modelStore.svelte.js";
import {
  __resetEntitiesIndexCache,
  __resetStaticBaseProvider,
  fetchScene,
  fetchGraph,
  fetchModelsManifest,
  setStaticBaseProvider,
} from "../lib/api.js";

function jsonResponse(body, ok = true) {
  return {
    ok,
    status: ok ? 200 : 404,
    statusText: ok ? "OK" : "Not Found",
    json: async () => body,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  __resetEntitiesIndexCache();
  __resetStaticBaseProvider();
});

describe("parseManifest", () => {
  it("normalises models and picks the declared default", () => {
    const { models, defaultId } = parseManifest({
      version: 1,
      default: "sonnet-4.6",
      models: [
        { id: "opus-4.8xh", label: "Claude Opus 4.8", nodeCount: 1558 },
        { id: "sonnet-4.6", label: "Claude Sonnet 4.6", nodeCount: 768 },
      ],
    });
    expect(models).toHaveLength(2);
    expect(models[0]).toEqual({ id: "opus-4.8xh", label: "Claude Opus 4.8", nodeCount: 1558, base: "models/opus-4.8xh" });
    expect(defaultId).toBe("sonnet-4.6");
  });

  it("falls back to the first model when default is absent or unknown", () => {
    expect(parseManifest({ models: [{ id: "a" }, { id: "b" }] }).defaultId).toBe("a");
    expect(parseManifest({ default: "zzz", models: [{ id: "a" }, { id: "b" }] }).defaultId).toBe("a");
  });

  it("drops malformed entries and tolerates a missing models array", () => {
    const { models, defaultId } = parseManifest({ models: [{ id: "ok" }, {}, { label: "no id" }, null] });
    expect(models.map((m) => m.id)).toEqual(["ok"]);
    expect(parseManifest({}).models).toEqual([]);
    expect(parseManifest(null).defaultId).toBeNull();
    expect(defaultId).toBe("ok");
  });

  it("honours a custom path and strips trailing slashes", () => {
    const { models } = parseManifest({ models: [{ id: "x", path: "data/x/" }] });
    expect(models[0].base).toBe("data/x");
    expect(modelBase(models, "x")).toBe("data/x");
    expect(modelBase(models, "missing")).toBeNull();
  });
});

describe("createModelStore", () => {
  it("loads a manifest, exposes the active base, and switches models", () => {
    const store = createModelStore();
    expect(store.base).toBeNull(); // single-model / server mode

    store.setManifest({
      default: "opus-4.8xh",
      models: [
        { id: "opus-4.8xh", label: "Opus", nodeCount: 1558 },
        { id: "sonnet-4.6", label: "Sonnet", nodeCount: 768 },
      ],
    });
    expect(store.activeId).toBe("opus-4.8xh");
    expect(store.base).toBe("models/opus-4.8xh");
    expect(store.active.label).toBe("Opus");

    expect(store.select("sonnet-4.6")).toBe(true);
    expect(store.base).toBe("models/sonnet-4.6");

    expect(store.select("sonnet-4.6")).toBe(false); // no-op, already active
    expect(store.select("nope")).toBe(false); // unknown id
    expect(store.base).toBe("models/sonnet-4.6");
  });
});

describe("manifest-driven, model-aware fetches", () => {
  it("fetchModelsManifest reads ./models.json and returns null when absent", async () => {
    const manifest = { version: 1, models: [{ id: "opus-4.8xh" }] };
    vi.stubGlobal("fetch", vi.fn(async (url) =>
      url === "./models.json" ? jsonResponse(manifest) : jsonResponse({}, false),
    ));
    await expect(fetchModelsManifest()).resolves.toEqual(manifest);

    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, false)));
    await expect(fetchModelsManifest()).resolves.toBeNull();
  });

  it("resolves scene/graph under the ACTIVE model's dir when a base provider is set", async () => {
    const store = createModelStore();
    store.setManifest({ models: [{ id: "opus-4.8xh" }, { id: "sonnet-4.6" }] });
    setStaticBaseProvider(() => store.base);

    const opusScene = { nodes: [{ id: "o" }], edges: [], stats: { nodeCount: 1 } };
    const sonnetGraph = { nodes: [{ id: "s" }], links: [] };
    const fetchMock = vi.fn(async (url) => {
      // No same-origin server in a static bundle: the API route 404s, fallback wins.
      if (url.startsWith("/api/")) return jsonResponse({ error: "nope" }, false);
      if (url === "./models/opus-4.8xh/scene.json") return jsonResponse(opusScene);
      if (url === "./models/sonnet-4.6/graph.json") return jsonResponse(sonnetGraph);
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    // Active = opus -> scene resolves under models/opus-4.8xh/.
    await expect(fetchScene()).resolves.toEqual(opusScene);
    expect(fetchMock).toHaveBeenCalledWith("./models/opus-4.8xh/scene.json", expect.anything());

    // Switch to sonnet -> the SAME fetchGraph now resolves under models/sonnet-4.6/.
    store.select("sonnet-4.6");
    await expect(fetchGraph()).resolves.toEqual(sonnetGraph);
    expect(fetchMock).toHaveBeenCalledWith("./models/sonnet-4.6/graph.json", expect.anything());
  });
});
