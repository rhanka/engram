/**
 * Postgres GraphStore adapter tests (SPEC_STORAGE_BACKENDS.md, "Future
 * Backends"). All tests use an in-memory fake `pg` module injected via
 * StoreTestDeps — no real Postgres connection is required. A gated live suite
 * at the bottom runs only when GRAPHIFY_TEST_POSTGRES_URL is set.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import Graph from "graphology";
import { contractFixture, describeGraphStoreContract } from "./helpers/graph-store-contract.js";
import type { GraphStore, StoreTestDeps } from "../src/storage/types.js";

// ---------------------------------------------------------------------------
// Fake driver infrastructure
// ---------------------------------------------------------------------------

interface RecordedSql {
  /** "pool" for pool.query, "client" for a checked-out client.query. */
  via: "pool" | "client";
  text: string;
  params?: unknown[];
}

/** In-memory state for the fake Postgres backend. */
interface InMemoryPgState {
  /** Every SQL statement run, in order, across pool + clients. */
  queries: RecordedSql[];
  /** Number of pool.connect() calls (one per transaction). */
  connects: number;
  /** Rows the next graph_meta SELECT should return. */
  metaRows: Array<Record<string, unknown>>;
  /** Rows the next neighbor JOIN should return. */
  neighborRows: Array<Record<string, unknown>>;
  poolEnded: boolean;
}

function freshState(): InMemoryPgState {
  return {
    queries: [],
    connects: 0,
    metaRows: [],
    neighborRows: [],
    poolEnded: false,
  };
}

function answer(state: InMemoryPgState, text: string) {
  const upper = text.toUpperCase();
  if (text.includes("graph_meta") && upper.includes("SELECT")) {
    return { rows: state.metaRows, rowCount: state.metaRows.length };
  }
  // Neighbor JOIN: a SELECT that joins graph_edges to graph_nodes.
  if (
    upper.includes("SELECT") &&
    text.includes("graph_edges") &&
    text.includes("graph_nodes") &&
    upper.includes("JOIN")
  ) {
    return { rows: state.neighborRows, rowCount: state.neighborRows.length };
  }
  return { rows: [], rowCount: 0 };
}

function makeFakePgModule(state: InMemoryPgState) {
  class FakePool {
    constructor(_config?: Record<string, unknown>) {}
    query(text: string, params?: unknown[]) {
      state.queries.push({ via: "pool", text, params });
      return Promise.resolve(answer(state, text));
    }
    connect() {
      state.connects += 1;
      const client = {
        query(text: string, params?: unknown[]) {
          state.queries.push({ via: "client", text, params });
          return Promise.resolve(answer(state, text));
        },
        release() {
          /* no-op */
        },
      };
      return Promise.resolve(client);
    }
    end() {
      state.poolEnded = true;
      return Promise.resolve();
    }
  }
  return { Pool: FakePool };
}

async function makePostgresStore(
  state: InMemoryPgState,
  overrides?: Partial<Parameters<typeof import("../src/storage/postgres.js")["createPostgresGraphStore"]>[0]>,
): Promise<GraphStore> {
  const { createPostgresGraphStore } = await import("../src/storage/postgres.js");
  const deps: StoreTestDeps = { driverModule: makeFakePgModule(state) };
  return createPostgresGraphStore(
    {
      connectionString: "postgres://user:pass@localhost:5432/testdb",
      citySlug: "test_city",
      ...overrides,
    },
    deps,
  );
}

/** Collect every statement text, regardless of via. */
function allSql(state: InMemoryPgState): string[] {
  return state.queries.map((q) => q.text);
}

/** Find the first INSERT into a given table. */
function findInsert(state: InMemoryPgState, table: string): RecordedSql | undefined {
  return state.queries.find(
    (q) => q.text.includes(`INSERT INTO ${table}`),
  );
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
// Artifact base sandbox — keep latest.json writes out of the repo tree.
// ---------------------------------------------------------------------------

const tempDirs: string[] = [];
function freshArtifactBase(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-pg-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Contract suite
// ---------------------------------------------------------------------------

describeGraphStoreContract("PostgresGraphStore (fake driver)", async () => {
  const state = freshState();
  return makePostgresStore(state, {
    citySlug: `contract_${Date.now()}`,
    target: freshArtifactBase(),
  });
});

// ---------------------------------------------------------------------------
// Schema ensure-exists: tables + indexes
// ---------------------------------------------------------------------------

describe("Postgres adapter: schema ensure-exists", () => {
  it("creates the three tables and all five indexes on push", async () => {
    const state = freshState();
    const { G, communities } = contractFixture();
    const store = await makePostgresStore(state, {
      citySlug: "schema_test",
      target: freshArtifactBase(),
    });

    await store.pushGraph(G, communities);
    await store.close();

    const ddl = allSql(state).join("\n");
    expect(ddl).toContain("CREATE TABLE IF NOT EXISTS graph_nodes");
    expect(ddl).toContain("CREATE TABLE IF NOT EXISTS graph_edges");
    expect(ddl).toContain("CREATE TABLE IF NOT EXISTS graph_meta");
    // Primary keys are city_slug-scoped.
    expect(ddl).toContain("PRIMARY KEY (city_slug, id)");
    expect(ddl).toContain("PRIMARY KEY (city_slug, source_id, target_id, relation)");
    // props columns are jsonb.
    expect(ddl).toContain("props jsonb");
    // Composite (city_slug, type) index.
    expect(ddl).toMatch(/CREATE INDEX[^\n]*ON graph_nodes \(city_slug, type\)/);
    // GIN full-text french index on label.
    expect(ddl).toContain("USING gin (to_tsvector('french', coalesce(label, '')))");
    // GIN props jsonb_path_ops index.
    expect(ddl).toContain("USING gin (props jsonb_path_ops)");
    // Neighbor-JOIN indexes.
    expect(ddl).toMatch(/CREATE INDEX[^\n]*ON graph_edges \(city_slug, source_id\)/);
    expect(ddl).toMatch(/CREATE INDEX[^\n]*ON graph_edges \(city_slug, target_id\)/);
  });

  it("exposes the DDL through the exported source-of-truth function", async () => {
    const { postgresDdlStatements } = await import("../src/storage/postgres.js");
    const stmts = postgresDdlStatements();
    const joined = stmts.join("\n");
    expect(joined).toContain("CREATE TABLE IF NOT EXISTS graph_nodes");
    expect(joined).toContain("USING gin (props jsonb_path_ops)");
    // No schema prefix when none is configured.
    expect(joined).not.toContain('CREATE SCHEMA');
  });

  it("schema-qualifies tables when a schema is configured", async () => {
    const { postgresDdlStatements } = await import("../src/storage/postgres.js");
    const stmts = postgresDdlStatements("graphify");
    const joined = stmts.join("\n");
    expect(joined).toContain('CREATE SCHEMA IF NOT EXISTS "graphify"');
    expect(joined).toContain('CREATE TABLE IF NOT EXISTS "graphify".graph_nodes');
  });

  it("ensures schema only once across multiple pushes", async () => {
    const state = freshState();
    const { G, communities } = contractFixture();
    const store = await makePostgresStore(state, {
      citySlug: "schema_once",
      target: freshArtifactBase(),
    });

    await store.pushGraph(G, communities);
    const ddlCountAfterFirst = allSql(state).filter((s) =>
      s.startsWith("CREATE TABLE"),
    ).length;
    await store.pushGraph(G, communities);
    await store.close();

    const ddlCountAfterSecond = allSql(state).filter((s) =>
      s.startsWith("CREATE TABLE"),
    ).length;
    expect(ddlCountAfterFirst).toBeGreaterThan(0);
    expect(ddlCountAfterSecond).toBe(ddlCountAfterFirst);
  });
});

// ---------------------------------------------------------------------------
// Writes: ON CONFLICT DO UPDATE upsert
// ---------------------------------------------------------------------------

describe("Postgres adapter: ON CONFLICT upsert (merge)", () => {
  it("nodes use INSERT ... ON CONFLICT (city_slug, id) DO UPDATE", async () => {
    const state = freshState();
    const { G, communities } = contractFixture();
    const store = await makePostgresStore(state, {
      citySlug: "upsert_nodes",
      target: freshArtifactBase(),
    });

    await store.pushGraph(G, communities);
    await store.close();

    const nodeInsert = findInsert(state, "graph_nodes");
    expect(nodeInsert).toBeDefined();
    expect(nodeInsert!.text).toContain("ON CONFLICT (city_slug, id) DO UPDATE");
    expect(nodeInsert!.text).toContain("label = EXCLUDED.label");
    // city_slug is the first bound parameter of each row.
    expect(nodeInsert!.params).toContain("upsert_nodes");
  });

  it("edges use INSERT ... ON CONFLICT (city_slug, source_id, target_id, relation)", async () => {
    const state = freshState();
    const { G, communities } = contractFixture();
    const store = await makePostgresStore(state, {
      citySlug: "upsert_edges",
      target: freshArtifactBase(),
    });

    await store.pushGraph(G, communities);
    await store.close();

    const edgeInsert = findInsert(state, "graph_edges");
    expect(edgeInsert).toBeDefined();
    expect(edgeInsert!.text).toContain(
      "ON CONFLICT (city_slug, source_id, target_id, relation) DO UPDATE",
    );
  });

  it("merge mode issues no DELETE", async () => {
    const state = freshState();
    const { G, communities } = contractFixture();
    const store = await makePostgresStore(state, {
      citySlug: "merge_no_delete",
      target: freshArtifactBase(),
    });

    await store.pushGraph(G, communities, { mode: "merge" });
    await store.close();

    expect(allSql(state).filter((s) => s.includes("DELETE FROM"))).toHaveLength(0);
  });

  it("wraps a push in a BEGIN/COMMIT transaction on one client", async () => {
    const state = freshState();
    const { G, communities } = contractFixture();
    const store = await makePostgresStore(state, {
      citySlug: "txn",
      target: freshArtifactBase(),
    });

    await store.pushGraph(G, communities);
    await store.close();

    expect(state.connects).toBe(1);
    const clientSql = state.queries.filter((q) => q.via === "client").map((q) => q.text);
    expect(clientSql).toContain("BEGIN");
    expect(clientSql).toContain("COMMIT");
  });
});

// ---------------------------------------------------------------------------
// Batching
// ---------------------------------------------------------------------------

describe("Postgres adapter: batched inserts", () => {
  it("batches 1200 nodes into 3 INSERTs with batchSize 500", async () => {
    const state = freshState();
    const G = largeGraph(1200);
    const store = await makePostgresStore(state, {
      citySlug: "batch_nodes",
      target: freshArtifactBase(),
    });

    await store.pushGraph(G, new Map(), { batchSize: 500 });
    await store.close();

    const nodeInserts = state.queries.filter((q) =>
      q.text.includes("INSERT INTO graph_nodes"),
    );
    expect(nodeInserts).toHaveLength(3); // 500 + 500 + 200
  });

  it("uses the default batch size of 500 when unspecified", async () => {
    const state = freshState();
    const G = largeGraph(600);
    const store = await makePostgresStore(state, {
      citySlug: "default_batch",
      target: freshArtifactBase(),
    });

    await store.pushGraph(G, new Map());
    await store.close();

    const nodeInserts = state.queries.filter((q) =>
      q.text.includes("INSERT INTO graph_nodes"),
    );
    expect(nodeInserts).toHaveLength(2); // ceil(600/500)
  });
});

// ---------------------------------------------------------------------------
// Mode: replace
// ---------------------------------------------------------------------------

describe("Postgres adapter: replace mode", () => {
  it("deletes city_slug rows before inserting (delete-then-load)", async () => {
    const state = freshState();
    const { G, communities } = contractFixture();
    const store = await makePostgresStore(state, {
      citySlug: "replace_city",
      target: freshArtifactBase(),
    });

    await store.pushGraph(G, communities, { mode: "replace" });
    await store.close();

    const nodeDelete = state.queries.find(
      (q) => q.text.includes("DELETE FROM graph_nodes") && q.text.includes("city_slug = $1"),
    );
    const edgeDelete = state.queries.find(
      (q) => q.text.includes("DELETE FROM graph_edges") && q.text.includes("city_slug = $1"),
    );
    expect(nodeDelete).toBeDefined();
    expect(edgeDelete).toBeDefined();
    expect(nodeDelete!.params?.[0]).toBe("replace_city");
  });
});

// ---------------------------------------------------------------------------
// Neighbor JOIN — the N+1 fix
// ---------------------------------------------------------------------------

describe("Postgres adapter: queryNeighbors single JOIN", () => {
  it("runs ONE JOIN query (graph_edges ⋈ graph_nodes), not per-edge SELECTs", async () => {
    const state = freshState();
    state.neighborRows = [
      { id: "beta", label: "Beta", relation: "imports", direction: "out" },
    ];
    const { createPostgresGraphStore } = await import("../src/storage/postgres.js");
    const store = (await createPostgresGraphStore(
      { connectionString: "postgres://x", citySlug: "join_city", target: freshArtifactBase() },
      { driverModule: makeFakePgModule(state) },
    ));

    const rows = await store.queryNeighbors("alpha");
    await store.close();

    const joinQueries = state.queries.filter(
      (q) =>
        q.text.includes("JOIN") &&
        q.text.includes("graph_edges") &&
        q.text.includes("graph_nodes"),
    );
    // A single round-trip carries both directions via UNION ALL.
    expect(joinQueries).toHaveLength(1);
    expect(joinQueries[0].text).toContain("UNION ALL");
    expect(joinQueries[0].params).toEqual(["join_city", "alpha"]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("beta");
  });
});

// ---------------------------------------------------------------------------
// S3-replay: latest.json artifact
// ---------------------------------------------------------------------------

describe("Postgres adapter: latest.json artifact (S3 replay)", () => {
  it("writes graph/{citySlug}/latest.json via the canonical toJson writer", async () => {
    const state = freshState();
    const { G, communities } = contractFixture();
    const base = freshArtifactBase();
    const store = await makePostgresStore(state, {
      citySlug: "replay_city",
      target: base,
    });

    await store.pushGraph(G, communities);
    await store.close();

    const artifact = join(base, "graph", "replay_city", "latest.json");
    expect(existsSync(artifact)).toBe(true);
    const parsed = JSON.parse(readFileSync(artifact, "utf-8")) as {
      nodes?: unknown[];
      links?: unknown[];
      topology_signature?: string;
    };
    expect(parsed.nodes).toHaveLength(G.order);
    expect(parsed.links).toHaveLength(G.size);
    expect(typeof parsed.topology_signature).toBe("string");
  });

  it("does NOT write the artifact on dryRun", async () => {
    const state = freshState();
    const { G, communities } = contractFixture();
    const base = freshArtifactBase();
    const store = await makePostgresStore(state, {
      citySlug: "dry_replay",
      target: base,
    });

    await store.pushGraph(G, communities, { dryRun: true });
    await store.close();

    expect(existsSync(join(base, "graph", "dry_replay", "latest.json"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GraphifyMeta stamping + read-back
// ---------------------------------------------------------------------------

describe("Postgres adapter: GraphifyMeta", () => {
  it("upserts a graph_meta row on push", async () => {
    const state = freshState();
    const { G, communities } = contractFixture();
    const store = await makePostgresStore(state, {
      citySlug: "meta_test",
      target: freshArtifactBase(),
    });

    await store.pushGraph(G, communities);
    await store.close();

    const metaInsert = state.queries.find((q) =>
      q.text.includes("INSERT INTO graph_meta"),
    );
    expect(metaInsert).toBeDefined();
    expect(metaInsert!.text).toContain("ON CONFLICT (city_slug) DO UPDATE");
    expect(metaInsert!.params?.[0]).toBe("meta_test");
    // topology_signature is a non-empty string.
    expect(typeof metaInsert!.params?.[1]).toBe("string");
    expect((metaInsert!.params?.[1] as string).length).toBeGreaterThan(0);
  });

  it("readSnapshotMeta queries graph_meta when no local cache exists", async () => {
    const state = freshState();
    state.metaRows = [
      { topology_signature: "n=1;e=0;x|", pushed_at: "2026-06-11T00:00:00.000Z", tool_version: "9.9.9" },
    ];
    const store = await makePostgresStore(state, {
      citySlug: "meta_read",
      target: freshArtifactBase(),
    });

    const meta = await store.readSnapshotMeta();
    await store.close();

    const readQuery = state.queries.find(
      (q) => q.text.includes("graph_meta") && q.text.includes("SELECT"),
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

describe("Postgres adapter: dryRun", () => {
  it("returns correct counts but performs no SQL writes", async () => {
    const state = freshState();
    const { G, communities } = contractFixture();
    const store = await makePostgresStore(state, {
      citySlug: "dry_run",
      target: freshArtifactBase(),
    });

    const result = await store.pushGraph(G, communities, { dryRun: true });
    await store.close();

    expect(result.nodes).toBe(G.order);
    expect(result.edges).toBe(G.size);
    // No DDL, no inserts, no transaction.
    expect(state.queries.filter((q) => q.text.includes("INSERT INTO"))).toHaveLength(0);
    expect(state.queries.filter((q) => q.text.startsWith("CREATE TABLE"))).toHaveLength(0);
    expect(state.connects).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// clear() — force-gated
// ---------------------------------------------------------------------------

describe("Postgres adapter: clear", () => {
  it("refuses clear without force", async () => {
    const state = freshState();
    const store = await makePostgresStore(state, {
      citySlug: "clear_ns",
      target: freshArtifactBase(),
    });

    await expect((store.clear as (o?: unknown) => Promise<void>)()).rejects.toThrow(/force/i);
    await store.close();
  });

  it("clears city_slug rows with force across all three tables", async () => {
    const state = freshState();
    const { G, communities } = contractFixture();
    const store = await makePostgresStore(state, {
      citySlug: "clear_force",
      target: freshArtifactBase(),
    });

    await store.pushGraph(G, communities);
    state.queries.length = 0;

    await (store.clear as (o?: unknown) => Promise<void>)({ force: true });
    await store.close();

    const deletes = state.queries
      .filter((q) => q.text.includes("DELETE FROM"))
      .map((q) => q.text);
    expect(deletes.some((s) => s.includes("graph_nodes"))).toBe(true);
    expect(deletes.some((s) => s.includes("graph_edges"))).toBe(true);
    expect(deletes.some((s) => s.includes("graph_meta"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// query() passthrough
// ---------------------------------------------------------------------------

describe("Postgres adapter: query passthrough", () => {
  it("runs a SQL statement and forwards positional params", async () => {
    const state = freshState();
    const store = await makePostgresStore(state, {
      citySlug: "query_ns",
      target: freshArtifactBase(),
    });

    await store.query!("SELECT * FROM graph_nodes WHERE id = $1", ["alpha"]);
    await store.close();

    const q = state.queries.find((s) => s.text.includes("WHERE id = $1"));
    expect(q).toBeDefined();
    expect(q!.params).toEqual(["alpha"]);
  });
});

// ---------------------------------------------------------------------------
// close()
// ---------------------------------------------------------------------------

describe("Postgres adapter: close", () => {
  it("ends the pool", async () => {
    const state = freshState();
    const store = await makePostgresStore(state, {
      citySlug: "close_ns",
      target: freshArtifactBase(),
    });

    await store.close();
    expect(state.poolEnded).toBe(true);
  });

  it("is safe to call close() multiple times", async () => {
    const state = freshState();
    const store = await makePostgresStore(state, {
      citySlug: "close_twice",
      target: freshArtifactBase(),
    });

    await store.close();
    await expect(store.close()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Registry + missing-driver error + capabilities
// ---------------------------------------------------------------------------

describe("Postgres adapter: registry and driver loading", () => {
  it("is registered with id 'postgres'", async () => {
    const { listGraphStoreIds } = await import("../src/storage/registry.js");
    expect(listGraphStoreIds()).toContain("postgres");
  });

  it("throws an actionable error when the driver package is missing", async () => {
    const { resolveGraphStore, registerGraphStoreFactory } = await import(
      "../src/storage/registry.js"
    );
    registerGraphStoreFactory({
      id: "postgres-missing-driver-test",
      requiredPackage: "pg-does-not-exist-xyzzy",
      async create() {
        throw new Error("should not be called");
      },
    });

    await expect(
      resolveGraphStore("postgres-missing-driver-test", {
        connectionString: "postgres://x",
      }),
    ).rejects.toThrow(/requires pg-does-not-exist-xyzzy.*npm install/i);
  });
});

describe("Postgres adapter: capabilities", () => {
  it("exposes id=postgres and capabilities including query=true", async () => {
    const state = freshState();
    const store = await makePostgresStore(state, {
      citySlug: "caps",
      target: freshArtifactBase(),
    });

    expect(store.id).toBe("postgres");
    expect(store.capabilities.push).toBe(true);
    expect(store.capabilities.query).toBe(true);
    expect(store.capabilities.clear).toBe(true);
    expect(store.capabilities.snapshotMeta).toBe(true);
    await store.close();
  });
});

// ---------------------------------------------------------------------------
// Live suite — gated on GRAPHIFY_TEST_POSTGRES_URL
// ---------------------------------------------------------------------------

describe.skipIf(!process.env.GRAPHIFY_TEST_POSTGRES_URL)(
  "Postgres adapter: live round-trip",
  () => {
    const connectionString = process.env.GRAPHIFY_TEST_POSTGRES_URL as string;
    const citySlug = `graphify_test_${Date.now()}`;

    it("push → readSnapshotMeta → queryNeighbors → clear round-trip", async () => {
      const { createPostgresGraphStore } = await import("../src/storage/postgres.js");
      const base = freshArtifactBase();
      const store = await createPostgresGraphStore({
        connectionString,
        citySlug,
        target: base,
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

        const neighbors = await store.queryNeighbors("alpha");
        expect(Array.isArray(neighbors)).toBe(true);
        // alpha -> beta (out) is one neighbor.
        expect(neighbors.some((n) => n.id === "beta")).toBe(true);

        expect(existsSync(join(base, "graph", citySlug, "latest.json"))).toBe(true);

        await store.clear({ force: true });
        expect(await store.readSnapshotMeta()).toBeUndefined();
      } finally {
        await store.close();
      }
    });
  },
);
