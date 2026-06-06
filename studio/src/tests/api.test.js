import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchScene } from "../lib/api.js";

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
