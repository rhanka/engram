/**
 * GET /api/ontology/window — storage LOT 3 server route (windowed loader).
 *
 * The route serves the studio's BOUNDED first-paint slice from a configured,
 * window-capable GraphStore mirror (degree-top-n; a single indexed scan). When
 * no such store is wired the route 404s so the SPA falls back to the full scene
 * — i.e. the default flat-JSON studio is unchanged. These tests inject a MINIMAL
 * fake store (the `StudioWindowStore` slice) directly; no live DB and no postgres
 * driver, mirroring tests/ontology-studio-groups-route.test.ts.
 */
import { describe, expect, it } from "vitest";

import {
  handleOntologyWindowRequest,
  type OntologyStudioHandlerOptions,
  type StudioStore,
} from "../src/ontology-studio.js";
import type { GraphWindow, GraphWindowOptions } from "../src/storage/types.js";

const WINDOW: GraphWindow = {
  strategy: "degree-top-n",
  layout: "force",
  limit: 2,
  nodes: [
    { id: "hub", label: "Hub", node_type: "code", x: 10, y: 20, degree: 3 },
    { id: "a", label: "Node A", node_type: "doc", x: 1, y: 1, degree: 2 },
  ],
  edges: [{ source: "hub", target: "a", relation: "links" }],
};

/** A minimal window-capable store: declares the capability + serves WINDOW. */
function fakeStore(
  layouts: string[],
  strategies: string[],
  opts: { onCall?: (options: GraphWindowOptions) => void; result?: GraphWindow } = {},
): StudioStore {
  return {
    capabilities: {
      push: true,
      query: true,
      clear: true,
      snapshotMeta: true,
      window: { version: 1, layouts, strategies },
    },
    async graphWindow(options: GraphWindowOptions = {}): Promise<GraphWindow> {
      opts.onCall?.(options);
      return opts.result ?? WINDOW;
    },
  };
}

/** A store WITHOUT the window capability (and no graphWindow), e.g. neo4j. */
const noWindowStore: StudioStore = {
  capabilities: { push: true, query: true, clear: true, snapshotMeta: true },
};

function options(store?: StudioStore): OntologyStudioHandlerOptions {
  return store ? { profileStatePath: "/unused", store } : { profileStatePath: "/unused" };
}

describe("GET /api/ontology/window (window-capable store)", () => {
  it("returns the store's bounded slice for an advertised strategy + layout", async () => {
    const calls: GraphWindowOptions[] = [];
    const store = fakeStore(["force"], ["degree-top-n"], { onCall: (o) => calls.push(o) });

    const result = await handleOntologyWindowRequest(
      options(store),
      "/api/ontology/window?strategy=degree-top-n&layout=force&limit=2",
    );

    expect(result.status).toBe(200);
    expect(result.contentType).toBe("application/json; charset=utf-8");
    expect(JSON.parse(result.body)).toEqual(WINDOW);
    // The read hit the store exactly once, with the parsed window options.
    expect(calls).toEqual([{ strategy: "degree-top-n", layout: "force", limit: 2 }]);
  });

  it("defaults to the first advertised strategy + layout when params are omitted", async () => {
    const calls: GraphWindowOptions[] = [];
    const store = fakeStore(["force"], ["degree-top-n"], { onCall: (o) => calls.push(o) });

    const result = await handleOntologyWindowRequest(options(store), "/api/ontology/window");

    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual(WINDOW);
    // No ?limit → graphWindow called without an explicit cap (the store defaults).
    expect(calls).toEqual([{ strategy: "degree-top-n", layout: "force" }]);
  });

  it("404s for a strategy the capability does not advertise (client keeps the full scene)", async () => {
    const calls: GraphWindowOptions[] = [];
    const store = fakeStore(["force"], ["degree-top-n"], { onCall: (o) => calls.push(o) });

    const result = await handleOntologyWindowRequest(
      options(store),
      "/api/ontology/window?strategy=bbox",
    );

    expect(result.status).toBe(404);
    // Gated BEFORE any store read — the window reader is never invoked.
    expect(calls).toEqual([]);
  });

  it("404s for a layout the capability does not advertise", async () => {
    const calls: GraphWindowOptions[] = [];
    const store = fakeStore(["force"], ["degree-top-n"], { onCall: (o) => calls.push(o) });

    const result = await handleOntologyWindowRequest(
      options(store),
      "/api/ontology/window?layout=dag",
    );

    expect(result.status).toBe(404);
    expect(calls).toEqual([]);
  });

  it("500s when the store read throws (the SPA can still fall back)", async () => {
    const store: StudioStore = {
      capabilities: {
        push: true,
        query: true,
        clear: true,
        snapshotMeta: true,
        window: { version: 1, layouts: ["force"], strategies: ["degree-top-n"] },
      },
      async graphWindow(): Promise<GraphWindow> {
        throw new Error("connection refused");
      },
    };

    const result = await handleOntologyWindowRequest(
      options(store),
      "/api/ontology/window?layout=force",
    );

    expect(result.status).toBe(500);
    expect(JSON.parse(result.body).error).toContain("connection refused");
  });
});

describe("GET /api/ontology/window (no window-capable store)", () => {
  it("404s when NO store is configured (default flat-JSON studio)", async () => {
    const result = await handleOntologyWindowRequest(options(), "/api/ontology/window");
    expect(result.status).toBe(404);
    expect(JSON.parse(result.body).error).toMatch(/no windowed-loader store/);
  });

  it("404s when a store is configured but omits the window capability", async () => {
    const result = await handleOntologyWindowRequest(options(noWindowStore), "/api/ontology/window");
    expect(result.status).toBe(404);
  });
});
