/**
 * GET /api/ontology/groups — storage LOT 2 server route.
 *
 * The route serves the studio's group-rail counts from a configured,
 * aggregate-capable GraphStore (O(#groups)). When no such store is wired the
 * route 404s so the SPA falls back to its in-memory group-by — i.e. the default
 * flat-JSON studio is unchanged. These tests inject a MINIMAL fake store (the
 * `StudioGroupCountsStore` slice) directly; no live DB and no postgres driver
 * are required, mirroring the storage fake-driver harness.
 */
import { describe, expect, it } from "vitest";

import {
  handleOntologyGroupsRequest,
  type OntologyStudioHandlerOptions,
  type StudioGroupCountsStore,
} from "../src/ontology-studio.js";
import type { GraphGroupCounts } from "../src/storage/types.js";

/** A minimal aggregate-capable store: declares `axes` + serves canned counts. */
function fakeStore(
  axes: string[],
  countsByAxis: Record<string, GraphGroupCounts>,
  opts: { onCall?: (axis: string) => void } = {},
): StudioGroupCountsStore {
  return {
    capabilities: {
      push: true,
      query: true,
      clear: true,
      snapshotMeta: true,
      aggregate: { version: 1, axes },
    },
    async groupCounts(axis: string): Promise<GraphGroupCounts> {
      opts.onCall?.(axis);
      return countsByAxis[axis] ?? { axis, groups: [] };
    },
  };
}

/** A store WITHOUT the aggregate capability (and no groupCounts), e.g. neo4j. */
const noAggregateStore: StudioGroupCountsStore = {
  capabilities: { push: true, query: true, clear: true, snapshotMeta: true },
};

const NODE_TYPE_COUNTS: GraphGroupCounts = {
  axis: "node_type",
  groups: [
    { key: "Character", label: "Character", count: 12 },
    { key: "Place", label: "Place", count: 5 },
  ],
};

function options(store?: StudioGroupCountsStore): OntologyStudioHandlerOptions {
  // profileStatePath is unused by this route (no patch context load); a dummy
  // value keeps the shape valid.
  return store ? { profileStatePath: "/unused", store } : { profileStatePath: "/unused" };
}

describe("GET /api/ontology/groups (store configured)", () => {
  it("returns the store's precomputed counts for an advertised axis", async () => {
    const calls: string[] = [];
    const store = fakeStore(["node_type", "community"], { node_type: NODE_TYPE_COUNTS }, {
      onCall: (axis) => calls.push(axis),
    });

    const result = await handleOntologyGroupsRequest(
      options(store),
      "/api/ontology/groups?axis=node_type",
    );

    expect(result.status).toBe(200);
    expect(result.contentType).toBe("application/json; charset=utf-8");
    expect(JSON.parse(result.body)).toEqual(NODE_TYPE_COUNTS);
    // The read hit the store exactly once, for the requested axis (O(#groups)).
    expect(calls).toEqual(["node_type"]);
  });

  it("defaults to the node_type axis when ?axis is omitted", async () => {
    const calls: string[] = [];
    const store = fakeStore(["node_type", "community"], { node_type: NODE_TYPE_COUNTS }, {
      onCall: (axis) => calls.push(axis),
    });

    const result = await handleOntologyGroupsRequest(options(store), "/api/ontology/groups");

    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual(NODE_TYPE_COUNTS);
    expect(calls).toEqual(["node_type"]);
  });

  it("404s for an axis the capability does not advertise (client keeps owning it)", async () => {
    const calls: string[] = [];
    const store = fakeStore(["node_type", "community"], {}, { onCall: (axis) => calls.push(axis) });

    const result = await handleOntologyGroupsRequest(
      options(store),
      "/api/ontology/groups?axis=class_id",
    );

    expect(result.status).toBe(404);
    // Gated BEFORE any store read — the store is never queried for an off-axis.
    expect(calls).toEqual([]);
  });

  it("500s when the store read throws (the SPA can still fall back)", async () => {
    const store: StudioGroupCountsStore = {
      capabilities: {
        push: true,
        query: true,
        clear: true,
        snapshotMeta: true,
        aggregate: { version: 1, axes: ["node_type"] },
      },
      async groupCounts(): Promise<GraphGroupCounts> {
        throw new Error("connection refused");
      },
    };

    const result = await handleOntologyGroupsRequest(
      options(store),
      "/api/ontology/groups?axis=node_type",
    );

    expect(result.status).toBe(500);
    expect(JSON.parse(result.body).error).toContain("connection refused");
  });
});

describe("GET /api/ontology/groups (no aggregate-capable store)", () => {
  it("404s when NO store is configured (default flat-JSON studio)", async () => {
    const result = await handleOntologyGroupsRequest(
      options(),
      "/api/ontology/groups?axis=node_type",
    );
    expect(result.status).toBe(404);
    expect(JSON.parse(result.body).error).toMatch(/no aggregate-capable store/);
  });

  it("404s when a store is configured but omits the aggregate capability", async () => {
    const result = await handleOntologyGroupsRequest(
      options(noAggregateStore),
      "/api/ontology/groups?axis=node_type",
    );
    expect(result.status).toBe(404);
  });
});
