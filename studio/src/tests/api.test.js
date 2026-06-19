import { afterEach, describe, expect, it, vi } from "vitest";

import {
  __resetEntitiesIndexCache,
  fetchClassHierarchies,
  fetchEntity,
  fetchReconciliationCandidates,
  fetchScene,
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
});

describe("fetchScene (ÉTAPE 1b)", () => {
  it("fetches the light scene from the same-origin API route", async () => {
    const scene = { nodes: [{ id: "a" }], edges: [], stats: { nodeCount: 1 } };
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/ontology/scene.json") return jsonResponse(scene);
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchScene()).resolves.toEqual(scene);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ontology/scene.json",
      expect.objectContaining({ headers: { accept: "application/json" } }),
    );
  });

  it("falls back to ./scene.json next to the bundle (standalone file://)", async () => {
    const scene = { nodes: [], edges: [], stats: { nodeCount: 0 } };
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/ontology/scene.json") return jsonResponse({ error: "nope" }, false);
      if (url === "./scene.json") return jsonResponse(scene);
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchScene()).resolves.toEqual(scene);
    expect(fetchMock).toHaveBeenCalledWith("./scene.json", expect.anything());
  });

  it("rejects when neither the API route nor the bundle copy is available", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: "nope" }, false));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchScene()).rejects.toThrow();
  });
});

describe("fetchEntity (standalone fallback)", () => {
  it("returns the server sidecar from the same-origin route", async () => {
    const sidecar = { id: "n1", description: { status: "generated", description: "x" }, occurrences: null };
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/ontology/entity/n1") return jsonResponse(sidecar);
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchEntity("n1")).resolves.toEqual(sidecar);
  });

  it("falls back to ./entities.json and looks up the id (standalone file://)", async () => {
    const index = {
      n1: { id: "n1", description: { status: "generated", description: "x" }, occurrences: null },
    };
    const fetchMock = vi.fn(async (url) => {
      if (url.startsWith("/api/ontology/entity/")) return jsonResponse({ error: "nope" }, false);
      if (url === "./entities.json") return jsonResponse(index);
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchEntity("n1")).resolves.toEqual(index.n1);
    await expect(fetchEntity("missing")).resolves.toBeNull();
    // The entities index is fetched once and then served from cache.
    expect(fetchMock.mock.calls.filter(([u]) => u === "./entities.json")).toHaveLength(1);
  });

  it("returns null when neither the route nor the index is available", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: "nope" }, false));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchEntity("n1")).resolves.toBeNull();
  });
});

describe("fetchClassHierarchies (EVOL 2.a)", () => {
  const artifact = {
    schema: "graphify_ontology_class_hierarchies_v1",
    hierarchies: { mystery: { classes_by_id: {} } },
  };

  it("returns the artifact from the same-origin route", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/ontology/class-hierarchies.json") return jsonResponse(artifact);
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchClassHierarchies()).resolves.toEqual(artifact);
  });

  it("falls back to the bundle-relative ./class-hierarchies.json (standalone file://)", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/ontology/class-hierarchies.json") return jsonResponse({ error: "nope" }, false);
      if (url === "./class-hierarchies.json") return jsonResponse(artifact);
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchClassHierarchies()).resolves.toEqual(artifact);
    expect(fetchMock).toHaveBeenCalledWith("./class-hierarchies.json", expect.anything());
  });

  it("returns null when the artifact is absent (never throws)", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: "nope" }, false));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchClassHierarchies()).resolves.toBeNull();
  });
});

describe("fetchReconciliationCandidates (standalone fallback)", () => {
  it("returns the server queue from the same-origin route", async () => {
    const queue = { items: [{ id: "c1" }], total: 1 };
    const fetchMock = vi.fn(async (url) => {
      if (url.startsWith("/api/ontology/reconciliation/candidates")) return jsonResponse(queue);
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchReconciliationCandidates()).resolves.toEqual(queue);
  });

  it("falls back to ./reconciliation-candidates.json (standalone file://)", async () => {
    const queue = { items: [{ id: "c1" }], total: 1 };
    const fetchMock = vi.fn(async (url) => {
      if (url.startsWith("/api/ontology/reconciliation/candidates")) return jsonResponse({ error: "nope" }, false);
      if (url === "./reconciliation-candidates.json") return jsonResponse(queue);
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchReconciliationCandidates()).resolves.toEqual(queue);
  });

  it("returns an empty queue with an error when both fail", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: "nope" }, false));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchReconciliationCandidates();
    expect(res.items).toEqual([]);
    expect(res.total).toBe(0);
    expect(res.error).toBeTruthy();
  });
});
