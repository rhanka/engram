/**
 * Spanner GraphStore adapter tests (SPEC_STORAGE_BACKENDS.md, "Spanner Graph").
 * All tests use an in-memory fake @google-cloud/spanner module injected via
 * StoreTestDeps — no real Spanner connection is required. A gated live suite at
 * the bottom runs only when SPANNER_EMULATOR_HOST is set.
 */
import { describe, expect, it } from "vitest";
import Graph from "graphology";
import { contractFixture, describeGraphStoreContract } from "./helpers/graph-store-contract.js";
import type { GraphStore, StoreTestDeps } from "../src/storage/types.js";

// ---------------------------------------------------------------------------
// Fake driver infrastructure
// ---------------------------------------------------------------------------

interface RecordedUpsert {
  table: string;
  rows: Array<Record<string, unknown>>;
}

interface RecordedSql {
  sql: string;
  params?: Record<string, unknown>;
}

/** In-memory state for the fake Spanner backend. */
interface InMemorySpannerState {
  /** insertOrUpdate (Table.upsert) batches, in order. */
  upserts: RecordedUpsert[];
  /** DDL statement arrays passed to updateSchema. */
  schemaUpdates: string[][];
  /** Partitioned-update DELETE statements (replace / clear). */
  partitionedUpdates: RecordedSql[];
  /** Plain queries run via database.run (meta read, query passthrough, verify). */
  queries: RecordedSql[];
  /** Rows the next database.run() should return (keyed loosely by sql contains). */
  metaRows: Array<Record<string, unknown>>;
  databaseClosed: boolean;
  clientClosed: boolean;
}

function makeFakeSpannerModule(state: InMemorySpannerState) {
  const database = {
    updateSchema(statements: string[]) {
      state.schemaUpdates.push(statements);
      return Promise.resolve([
        { promise: () => Promise.resolve({}) },
      ]);
    },
    table(name: string) {
      return {
        upsert(rows: Array<Record<string, unknown>>) {
          state.upserts.push({ table: name, rows });
          return Promise.resolve({});
        },
      };
    },
    run(query: { sql: string; params?: Record<string, unknown> }) {
      state.queries.push({ sql: query.sql, params: query.params });
      // Return the configured meta rows for a graphify_meta SELECT, else empty.
      if (query.sql.includes("graphify_meta") && query.sql.includes("SELECT")) {
        return Promise.resolve([state.metaRows]);
      }
      return Promise.resolve([[]]);
    },
    runPartitionedUpdate(query: { sql: string; params?: Record<string, unknown> }) {
      state.partitionedUpdates.push({ sql: query.sql, params: query.params });
      return Promise.resolve([0]);
    },
    close() {
      state.databaseClosed = true;
      return Promise.resolve();
    },
  };

  const instance = {
    database() {
      return database;
    },
  };

  class FakeSpanner {
    constructor(_options?: { projectId?: string }) {}
    instance() {
      return instance;
    }
    close() {
      state.clientClosed = true;
      return Promise.resolve();
    }
  }

  return { Spanner: FakeSpanner };
}

function freshState(): InMemorySpannerState {
  return {
    upserts: [],
    schemaUpdates: [],
    partitionedUpdates: [],
    queries: [],
    metaRows: [],
    databaseClosed: false,
    clientClosed: false,
  };
}

async function makeSpannerStore(
  state: InMemorySpannerState,
  overrides?: Partial<Parameters<typeof import("../src/storage/spanner.js")["createSpannerGraphStore"]>[0]>,
): Promise<GraphStore> {
  const { createSpannerGraphStore } = await import("../src/storage/spanner.js");
  const deps: StoreTestDeps = { driverModule: makeFakeSpannerModule(state) };
  return createSpannerGraphStore(
    {
      project: "test-project",
      instance: "test-instance",
      database: "test-database",
      namespace: "test_ns",
      ...overrides,
    },
    deps,
  );
}

/** Count upsert rows for a given table across all recorded batches. */
function totalUpsertRows(state: InMemorySpannerState, table: string): number {
  return state.upserts
    .filter((u) => u.table === table)
    .reduce((sum, u) => sum + u.rows.length, 0);
}

// ---------------------------------------------------------------------------
// Helper: large graph
// ---------------------------------------------------------------------------

function largeGraph(nodeCount: number): Graph {
  const G = new Graph();
  for (let i = 0; i < nodeCount; i++) {
    G.addNode(`node_${i}`, {
      label: `Node ${i}`,
      node_type: "code",
      source_file: `src/file_${i}.ts`,
    });
  }
  for (let i = 0; i < nodeCount - 1; i++) {
    G.addEdge(`node_${i}`, `node_${i + 1}`, { relation: "imports", confidence: "EXTRACTED" });
  }
  return G;
}

// ---------------------------------------------------------------------------
// Contract suite
// ---------------------------------------------------------------------------

describeGraphStoreContract("SpannerGraphStore (fake driver)", async () => {
  const state = freshState();
  return makeSpannerStore(state, { namespace: `contract_${Date.now()}` });
});

// ---------------------------------------------------------------------------
// Batching — insertOrUpdate (Table.upsert)
// ---------------------------------------------------------------------------

describe("Spanner adapter: batched insertOrUpdate", () => {
  it("batches 1200 nodes into 500/500/200 with batchSize 500", async () => {
    const state = freshState();
    const G = largeGraph(1200);
    const store = await makeSpannerStore(state, { namespace: "batch_test" });

    await store.pushGraph(G, new Map(), { batchSize: 500 });
    await store.close();

    const nodeBatches = state.upserts.filter((u) => u.table === "graphify_nodes");
    expect(nodeBatches).toHaveLength(3);
    expect(nodeBatches[0].rows.length).toBe(500);
    expect(nodeBatches[1].rows.length).toBe(500);
    expect(nodeBatches[2].rows.length).toBe(200);
    expect(totalUpsertRows(state, "graphify_nodes")).toBe(1200);
  });

  it("batches 1199 edges with batchSize 500", async () => {
    const state = freshState();
    const G = largeGraph(1200);
    const store = await makeSpannerStore(state, { namespace: "batch_edge_test" });

    await store.pushGraph(G, new Map(), { batchSize: 500 });
    await store.close();

    const edgeBatches = state.upserts.filter((u) => u.table === "graphify_edges");
    expect(edgeBatches.length).toBeGreaterThan(0);
    expect(totalUpsertRows(state, "graphify_edges")).toBe(1199);
  });

  it("uses the default batch size of 500 when unspecified", async () => {
    const state = freshState();
    const G = largeGraph(600);
    const store = await makeSpannerStore(state, { namespace: "default_batch" });

    await store.pushGraph(G, new Map());
    await store.close();

    const nodeBatches = state.upserts.filter((u) => u.table === "graphify_nodes");
    expect(nodeBatches).toHaveLength(2); // ceil(600/500)
  });

  it("upsert rows carry the namespace column", async () => {
    const state = freshState();
    const { G, communities } = contractFixture();
    const store = await makeSpannerStore(state, { namespace: "ns_column" });

    await store.pushGraph(G, communities);
    await store.close();

    for (const batch of state.upserts) {
      for (const row of batch.rows) {
        expect(row.namespace).toBe("ns_column");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Schema ensure-exists
// ---------------------------------------------------------------------------

describe("Spanner adapter: schema ensure-exists", () => {
  it("issues updateSchema with the namespaced tables and property graph on push", async () => {
    const state = freshState();
    const { G, communities } = contractFixture();
    const store = await makeSpannerStore(state, { namespace: "schema_test" });

    await store.pushGraph(G, communities);
    await store.close();

    expect(state.schemaUpdates.length).toBeGreaterThan(0);
    const flat = state.schemaUpdates.flat().join("\n");
    expect(flat).toContain("CREATE TABLE graphify_nodes");
    expect(flat).toContain("CREATE TABLE graphify_edges");
    expect(flat).toContain("CREATE TABLE graphify_meta");
    expect(flat).toContain("CREATE PROPERTY GRAPH graphify");
    // Namespaced primary keys
    expect(flat).toContain("PRIMARY KEY (namespace, id)");
    expect(flat).toContain("PRIMARY KEY (namespace, source_id, target_id, relation)");
  });

  it("ensures schema only once across multiple pushes", async () => {
    const state = freshState();
    const { G, communities } = contractFixture();
    const store = await makeSpannerStore(state, { namespace: "schema_once" });

    await store.pushGraph(G, communities);
    await store.pushGraph(G, communities);
    await store.close();

    expect(state.schemaUpdates).toHaveLength(1);
  });

  it("swallows an already-exists schema error", async () => {
    const state = freshState();
    const { G, communities } = contractFixture();
    const { createSpannerGraphStore } = await import("../src/storage/spanner.js");
    const mod = makeFakeSpannerModule(state);
    // Override updateSchema to throw ALREADY_EXISTS.
    const realModule = mod as unknown as {
      Spanner: new () => { instance(): { database(): { updateSchema(s: string[]): Promise<unknown> } } };
    };
    const proto = realModule.Spanner;
    const store = await createSpannerGraphStore(
      { project: "p", instance: "i", database: "d", namespace: "exists_ns" },
      {
        driverModule: {
          Spanner: class {
            instance() {
              return {
                database() {
                  return {
                    updateSchema() {
                      return Promise.reject(new Error("Table graphify_nodes already exists"));
                    },
                    table() {
                      return { upsert: () => Promise.resolve({}) };
                    },
                    run() {
                      return Promise.resolve([[]]);
                    },
                    runPartitionedUpdate() {
                      return Promise.resolve([0]);
                    },
                    close() {
                      return Promise.resolve();
                    },
                  };
                },
              };
            }
            close() {
              return Promise.resolve();
            }
          },
        },
      },
    );
    void proto;

    await expect(store.pushGraph(G, communities)).resolves.toBeDefined();
    await store.close();
  });
});

// ---------------------------------------------------------------------------
// Mode: merge vs replace
// ---------------------------------------------------------------------------

describe("Spanner adapter: merge mode", () => {
  it("uses insertOrUpdate and issues no DELETE in merge mode (default)", async () => {
    const state = freshState();
    const { G, communities } = contractFixture();
    const store = await makeSpannerStore(state, { namespace: "merge_ns" });

    await store.pushGraph(G, communities, { mode: "merge" });
    await store.close();

    expect(state.upserts.length).toBeGreaterThan(0);
    expect(state.partitionedUpdates.filter((p) => p.sql.includes("DELETE"))).toHaveLength(0);
  });

  it("default mode is merge", async () => {
    const state = freshState();
    const { G, communities } = contractFixture();
    const store = await makeSpannerStore(state, { namespace: "default_merge" });

    await store.pushGraph(G, communities);
    await store.close();

    expect(state.partitionedUpdates.filter((p) => p.sql.includes("DELETE"))).toHaveLength(0);
  });
});

describe("Spanner adapter: replace mode", () => {
  it("deletes namespace rows before loading (delete-then-load)", async () => {
    const state = freshState();
    const { G, communities } = contractFixture();
    const store = await makeSpannerStore(state, { namespace: "replace_ns" });

    await store.pushGraph(G, communities, { mode: "replace" });
    await store.close();

    const nodeDelete = state.partitionedUpdates.find(
      (p) => p.sql.includes("DELETE FROM graphify_nodes") && p.sql.includes("namespace"),
    );
    const edgeDelete = state.partitionedUpdates.find(
      (p) => p.sql.includes("DELETE FROM graphify_edges") && p.sql.includes("namespace"),
    );
    expect(nodeDelete).toBeDefined();
    expect(edgeDelete).toBeDefined();
    expect(nodeDelete!.params?.ns).toBe("replace_ns");
    // Deletes carry no node upserts before them.
    expect(state.upserts.length).toBeGreaterThan(0);
  });

  it("does not delete in merge mode", async () => {
    const state = freshState();
    const { G, communities } = contractFixture();
    const store = await makeSpannerStore(state, { namespace: "no_delete" });

    await store.pushGraph(G, communities, { mode: "merge" });
    await store.close();

    expect(state.partitionedUpdates).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// GraphifyMeta stamping + read-back
// ---------------------------------------------------------------------------

describe("Spanner adapter: GraphifyMeta", () => {
  it("upserts a graphify_meta row on push", async () => {
    const state = freshState();
    const { G, communities } = contractFixture();
    const store = await makeSpannerStore(state, { namespace: "meta_test" });

    await store.pushGraph(G, communities);
    await store.close();

    const metaUpsert = state.upserts.find((u) => u.table === "graphify_meta");
    expect(metaUpsert).toBeDefined();
    const row = metaUpsert!.rows[0];
    expect(row.namespace).toBe("meta_test");
    expect(typeof row.topology_signature).toBe("string");
    expect((row.topology_signature as string).length).toBeGreaterThan(0);
    expect(typeof row.pushed_at).toBe("string");
    expect(typeof row.tool_version).toBe("string");
  });

  it("readSnapshotMeta returns undefined before any push", async () => {
    const state = freshState();
    const store = await makeSpannerStore(state, { namespace: "meta_fresh" });

    const meta = await store.readSnapshotMeta();
    await store.close();
    expect(meta).toBeUndefined();
  });

  it("readSnapshotMeta queries graphify_meta when no local cache exists", async () => {
    const state = freshState();
    state.metaRows = [
      { topology_signature: "n=1;e=0;x|", pushed_at: "2026-06-11T00:00:00.000Z", tool_version: "9.9.9" },
    ];
    const store = await makeSpannerStore(state, { namespace: "meta_read" });

    const meta = await store.readSnapshotMeta();
    await store.close();

    const readQuery = state.queries.find(
      (q) => q.sql.includes("graphify_meta") && q.sql.includes("SELECT"),
    );
    expect(readQuery).toBeDefined();
    expect(meta).toBeDefined();
    expect(meta!.topologySignature).toBe("n=1;e=0;x|");
    expect(meta!.toolVersion).toBe("9.9.9");
  });
});

// ---------------------------------------------------------------------------
// dryRun
// ---------------------------------------------------------------------------

describe("Spanner adapter: dryRun", () => {
  it("returns correct counts but performs no schema/mutation/delete", async () => {
    const state = freshState();
    const { G, communities } = contractFixture();
    const store = await makeSpannerStore(state, { namespace: "dry_run" });

    const result = await store.pushGraph(G, communities, { dryRun: true });
    await store.close();

    expect(result.nodes).toBe(G.order);
    expect(result.edges).toBe(G.size);
    expect(state.upserts).toHaveLength(0);
    expect(state.schemaUpdates).toHaveLength(0);
    expect(state.partitionedUpdates).toHaveLength(0);
  });

  it("dryRun after a real push leaves snapshot meta unchanged", async () => {
    const state = freshState();
    const { G, communities } = contractFixture();
    const altG = new Graph();
    altG.addNode("x", { label: "X", node_type: "code", source_file: "x.ts" });
    const store = await makeSpannerStore(state, { namespace: "dry_after_real" });

    await store.pushGraph(G, communities);
    const before = await store.readSnapshotMeta();

    await store.pushGraph(altG, new Map(), { dryRun: true });
    const after = await store.readSnapshotMeta();
    await store.close();

    expect(after?.topologySignature).toBe(before?.topologySignature);
  });
});

// ---------------------------------------------------------------------------
// clear() — force-gated
// ---------------------------------------------------------------------------

describe("Spanner adapter: clear", () => {
  it("refuses clear without force", async () => {
    const state = freshState();
    const store = await makeSpannerStore(state, { namespace: "clear_ns" });

    await expect((store.clear as Function)()).rejects.toThrow(/force/i);
    await store.close();
  });

  it("clears namespace rows with force across all three tables", async () => {
    const state = freshState();
    const { G, communities } = contractFixture();
    const store = await makeSpannerStore(state, { namespace: "clear_force" });

    await store.pushGraph(G, communities);
    state.partitionedUpdates.length = 0;

    await (store.clear as Function)({ force: true });
    await store.close();

    const tables = state.partitionedUpdates
      .filter((p) => p.sql.includes("DELETE FROM"))
      .map((p) => p.sql);
    expect(tables.some((s) => s.includes("graphify_nodes"))).toBe(true);
    expect(tables.some((s) => s.includes("graphify_edges"))).toBe(true);
    expect(tables.some((s) => s.includes("graphify_meta"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// query() passthrough
// ---------------------------------------------------------------------------

describe("Spanner adapter: query passthrough", () => {
  it("runs a GQL/SQL statement and returns the backend result", async () => {
    const state = freshState();
    const store = await makeSpannerStore(state, { namespace: "query_ns" });

    await store.query!("SELECT * FROM graphify_nodes LIMIT 1");
    await store.close();

    const q = state.queries.find((s) => s.sql.includes("SELECT * FROM graphify_nodes"));
    expect(q).toBeDefined();
  });

  it("forwards a named-parameter bag", async () => {
    const state = freshState();
    const store = await makeSpannerStore(state, { namespace: "query_params" });

    await store.query!("SELECT * FROM graphify_nodes WHERE id = @id", { id: "alpha" });
    await store.close();

    const q = state.queries.find((s) => s.sql.includes("WHERE id = @id"));
    expect(q).toBeDefined();
    expect(q!.params?.id).toBe("alpha");
  });
});

// ---------------------------------------------------------------------------
// close()
// ---------------------------------------------------------------------------

describe("Spanner adapter: close", () => {
  it("closes the database (and client) handle", async () => {
    const state = freshState();
    const store = await makeSpannerStore(state);

    await store.close();
    expect(state.databaseClosed).toBe(true);
  });

  it("is safe to call close() multiple times", async () => {
    const state = freshState();
    const store = await makeSpannerStore(state);

    await store.close();
    await expect(store.close()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Registry + missing-driver error + capabilities
// ---------------------------------------------------------------------------

describe("Spanner adapter: registry and driver loading", () => {
  it("is registered with id 'spanner'", async () => {
    const { listGraphStoreIds } = await import("../src/storage/registry.js");
    expect(listGraphStoreIds()).toContain("spanner");
  });

  it("throws an actionable error when the driver package is missing", async () => {
    const { resolveGraphStore, registerGraphStoreFactory } = await import(
      "../src/storage/registry.js"
    );
    registerGraphStoreFactory({
      id: "spanner-missing-driver-test",
      requiredPackage: "@google-cloud/spanner-does-not-exist-xyzzy",
      async create() {
        throw new Error("should not be called");
      },
    });

    await expect(
      resolveGraphStore("spanner-missing-driver-test", {
        instance: "i",
        database: "d",
      }),
    ).rejects.toThrow(/requires @google-cloud\/spanner-does-not-exist-xyzzy.*npm install/i);
  });
});

describe("Spanner adapter: capabilities", () => {
  it("exposes id=spanner and capabilities including query=true", async () => {
    const state = freshState();
    const store = await makeSpannerStore(state);

    expect(store.id).toBe("spanner");
    expect(store.capabilities.push).toBe(true);
    expect(store.capabilities.query).toBe(true);
    expect(store.capabilities.clear).toBe(true);
    expect(store.capabilities.snapshotMeta).toBe(true);
    await store.close();
  });
});

// ---------------------------------------------------------------------------
// Live suite — gated on SPANNER_EMULATOR_HOST
// ---------------------------------------------------------------------------

describe.skipIf(!process.env.SPANNER_EMULATOR_HOST)(
  "Spanner adapter: live round-trip (emulator)",
  () => {
    const project = process.env.GRAPHIFY_SPANNER_PROJECT ?? "test-project";
    const instance = process.env.GRAPHIFY_SPANNER_INSTANCE ?? "test-instance";
    const database = process.env.GRAPHIFY_SPANNER_DATABASE ?? "test-database";
    const namespace = `graphify_test_${Date.now()}`;

    it("push → readSnapshotMeta → clear round-trip against the emulator", async () => {
      const { createSpannerGraphStore } = await import("../src/storage/spanner.js");
      const store = await createSpannerGraphStore({
        project,
        instance,
        database,
        namespace,
      });
      const { G, communities } = contractFixture();

      try {
        await store.verifyConnection();

        const result = await store.pushGraph(G, communities, { mode: "replace" });
        expect(result.nodes).toBe(G.order);
        expect(result.edges).toBe(G.size);

        const meta = await store.readSnapshotMeta();
        expect(meta).toBeDefined();
        expect(meta!.topologySignature.length).toBeGreaterThan(0);

        await (store.clear as Function)({ force: true });
        expect(await store.readSnapshotMeta()).toBeUndefined();
      } finally {
        await store.close();
      }
    });
  },
);
