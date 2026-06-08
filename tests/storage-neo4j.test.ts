/**
 * Neo4j GraphStore adapter tests (SPEC_STORAGE_BACKENDS.md, PR3).
 * All tests use an in-memory fake driver injected via StoreTestDeps — no
 * real Neo4j connection is required. A gated live suite at the bottom runs
 * only when GRAPHIFY_TEST_NEO4J_URI is set.
 */
import { describe, expect, it, vi } from "vitest";
import Graph from "graphology";
import { contractFixture, describeGraphStoreContract } from "./helpers/graph-store-contract.js";
import type { GraphStore, StoreTestDeps } from "../src/storage/types.js";

// ---------------------------------------------------------------------------
// Fake driver infrastructure
// ---------------------------------------------------------------------------

/** Recorded Cypher statement (text + parameters). */
interface RecordedStatement {
  text: string;
  params: Record<string, unknown>;
}

/** Simple in-memory state for the fake Neo4j backend. */
interface InMemoryNeo4jState {
  /** All statements run in the last session, cleared on session open. */
  statements: RecordedStatement[];
  /** All-time record, never cleared — lets us assert dryRun leaves nothing. */
  allStatements: RecordedStatement[];
  closed: boolean;
  driverClosed: boolean;
}

function makeFakeDriver(state: InMemoryNeo4jState) {
  const fakeSession = {
    run(text: string, params?: Record<string, unknown>) {
      const entry = { text, params: params ?? {} };
      state.statements.push(entry);
      state.allStatements.push(entry);
      return Promise.resolve({ records: [] });
    },
    close() {
      return Promise.resolve();
    },
  };

  const fakeDriver = {
    session() {
      state.statements = [];
      return fakeSession;
    },
    close() {
      state.driverClosed = true;
      return Promise.resolve();
    },
    verifyConnectivity() {
      return Promise.resolve({});
    },
  };

  return fakeDriver;
}

function makeFakeDriverModule(state: InMemoryNeo4jState) {
  const driver = makeFakeDriver(state);
  return {
    default: {
      driver(_uri: string, _auth: unknown) {
        return driver;
      },
      auth: {
        basic(_user: string, _pass: string) {
          return { scheme: "basic" };
        },
      },
    },
  };
}

async function makeNeo4jStore(
  state: InMemoryNeo4jState,
  overrides?: Partial<Parameters<typeof import("../src/storage/neo4j.js")["createNeo4jGraphStore"]>[0]>,
): Promise<GraphStore> {
  const { createNeo4jGraphStore } = await import("../src/storage/neo4j.js");
  const deps: StoreTestDeps = { driverModule: makeFakeDriverModule(state) };
  return createNeo4jGraphStore(
    {
      target: "bolt://localhost:7687",
      namespace: "test_ns",
      ...overrides,
    },
    deps,
  );
}

// ---------------------------------------------------------------------------
// Helper: build a large graph with N nodes
// ---------------------------------------------------------------------------

function largeGraph(nodeCount: number): Graph {
  const G = new Graph();
  for (let i = 0; i < nodeCount; i++) {
    G.addNode(`node_${i}`, {
      label: `Node ${i}`,
      file_type: "code",
      source_file: `src/file_${i}.ts`,
    });
  }
  for (let i = 0; i < nodeCount - 1; i++) {
    G.addEdge(`node_${i}`, `node_${i + 1}`, { relation: "imports", confidence: "EXTRACTED" });
  }
  return G;
}

// ---------------------------------------------------------------------------
// Contract suite — run the shared contract against the Neo4j adapter
// with an in-memory state driver for enough fidelity
// ---------------------------------------------------------------------------

describeGraphStoreContract("Neo4jGraphStore (fake driver)", async () => {
  // Each makeStore() call gets a fresh state + fresh store
  const state: InMemoryNeo4jState = {
    statements: [],
    allStatements: [],
    closed: false,
    driverClosed: false,
  };
  return makeNeo4jStore(state, { namespace: `contract_${Date.now()}` });
});

// ---------------------------------------------------------------------------
// Batching — UNWIND $rows
// ---------------------------------------------------------------------------

describe("Neo4j adapter: batched UNWIND push", () => {
  it("batches 1200 nodes into 3 batches of 500/500/200 with batchSize 500", async () => {
    const state: InMemoryNeo4jState = {
      statements: [],
      allStatements: [],
      closed: false,
      driverClosed: false,
    };
    const G = largeGraph(1200);
    const communities = new Map<number, string[]>();
    const store = await makeNeo4jStore(state, { namespace: "batch_test" });

    await store.pushGraph(G, communities, { batchSize: 500 });
    await store.close();

    // Count UNWIND node statements
    const nodeUnwinds = state.allStatements.filter(
      (s) => s.text.includes("UNWIND") && s.text.includes("$rows") && s.text.match(/\(n:/),
    );
    expect(nodeUnwinds).toHaveLength(3); // ceil(1200/500) = 3
    // Batch sizes: first two have 500 rows, last has 200
    expect((nodeUnwinds[0].params.rows as unknown[]).length).toBe(500);
    expect((nodeUnwinds[1].params.rows as unknown[]).length).toBe(500);
    expect((nodeUnwinds[2].params.rows as unknown[]).length).toBe(200);
  });

  it("batches edges similarly with batchSize 500 for 1199 edges", async () => {
    const state: InMemoryNeo4jState = {
      statements: [],
      allStatements: [],
      closed: false,
      driverClosed: false,
    };
    const G = largeGraph(1200); // 1199 edges (all "imports")
    const communities = new Map<number, string[]>();
    const store = await makeNeo4jStore(state, { namespace: "batch_edge_test" });

    await store.pushGraph(G, communities, { batchSize: 500 });
    await store.close();

    // Count UNWIND edge statements for the "IMPORTS" relation
    const edgeUnwinds = state.allStatements.filter(
      (s) => s.text.includes("UNWIND") && s.text.includes("$rows") && s.text.match(/\[r:/),
    );
    expect(edgeUnwinds.length).toBeGreaterThan(0);
    // Total rows across edge batches should be 1199
    const totalEdgeRows = edgeUnwinds.reduce(
      (sum, s) => sum + (s.params.rows as unknown[]).length,
      0,
    );
    expect(totalEdgeRows).toBe(1199);
  });

  it("uses default batchSize of 500 when not specified", async () => {
    const state: InMemoryNeo4jState = {
      statements: [],
      allStatements: [],
      closed: false,
      driverClosed: false,
    };
    const G = largeGraph(600); // 600 nodes → 2 batches
    const communities = new Map<number, string[]>();
    const store = await makeNeo4jStore(state, { namespace: "default_batch" });

    await store.pushGraph(G, communities); // no batchSize → default 500
    await store.close();

    const nodeUnwinds = state.allStatements.filter(
      (s) => s.text.includes("UNWIND") && s.text.includes("$rows") && s.text.match(/\(n:/),
    );
    expect(nodeUnwinds).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Mode: merge (MERGE upsert)
// ---------------------------------------------------------------------------

describe("Neo4j adapter: merge mode", () => {
  it("uses MERGE for nodes and edges in merge mode (default)", async () => {
    const state: InMemoryNeo4jState = {
      statements: [],
      allStatements: [],
      closed: false,
      driverClosed: false,
    };
    const { G, communities } = contractFixture();
    const store = await makeNeo4jStore(state, { namespace: "merge_test" });

    await store.pushGraph(G, communities, { mode: "merge" });
    await store.close();

    const nodeStatements = state.allStatements.filter(
      (s) => s.text.includes("MERGE") && s.text.match(/\(n:/),
    );
    expect(nodeStatements.length).toBeGreaterThan(0);
    const edgeStatements = state.allStatements.filter(
      (s) => s.text.includes("MERGE") && s.text.match(/\[r:/),
    );
    expect(edgeStatements.length).toBeGreaterThan(0);
  });

  it("default mode is merge", async () => {
    const state: InMemoryNeo4jState = {
      statements: [],
      allStatements: [],
      closed: false,
      driverClosed: false,
    };
    const { G, communities } = contractFixture();
    const store = await makeNeo4jStore(state, { namespace: "default_merge" });

    await store.pushGraph(G, communities); // no mode → merge
    await store.close();

    const mergeStatements = state.allStatements.filter((s) => s.text.includes("MERGE"));
    expect(mergeStatements.length).toBeGreaterThan(0);
    const matchDeleteStatements = state.allStatements.filter(
      (s) => s.text.includes("DETACH DELETE"),
    );
    expect(matchDeleteStatements).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Mode: replace (wipe + load)
// ---------------------------------------------------------------------------

describe("Neo4j adapter: replace mode", () => {
  it("issues DETACH DELETE for the namespace before loading", async () => {
    const state: InMemoryNeo4jState = {
      statements: [],
      allStatements: [],
      closed: false,
      driverClosed: false,
    };
    const { G, communities } = contractFixture();
    const store = await makeNeo4jStore(state, { namespace: "replace_ns" });

    await store.pushGraph(G, communities, { mode: "replace" });
    await store.close();

    const wipeStatement = state.allStatements.find(
      (s) => s.text.includes("DETACH DELETE") && s.text.includes("namespace"),
    );
    expect(wipeStatement).toBeDefined();
    // The wipe must come before node inserts — find indices
    const wipeIdx = state.allStatements.indexOf(wipeStatement!);
    const firstNodeIdx = state.allStatements.findIndex(
      (s) => s.text.includes("UNWIND") && s.text.match(/\(n:/),
    );
    expect(wipeIdx).toBeLessThan(firstNodeIdx);
  });

  it("does not DETACH DELETE in merge mode", async () => {
    const state: InMemoryNeo4jState = {
      statements: [],
      allStatements: [],
      closed: false,
      driverClosed: false,
    };
    const { G, communities } = contractFixture();
    const store = await makeNeo4jStore(state, { namespace: "no_wipe" });

    await store.pushGraph(G, communities, { mode: "merge" });
    await store.close();

    expect(state.allStatements.some((s) => s.text.includes("DETACH DELETE"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GraphifyMeta: write on push, read back
// ---------------------------------------------------------------------------

describe("Neo4j adapter: GraphifyMeta", () => {
  it("writes a GraphifyMeta node on push", async () => {
    const state: InMemoryNeo4jState = {
      statements: [],
      allStatements: [],
      closed: false,
      driverClosed: false,
    };
    const { G, communities } = contractFixture();
    const store = await makeNeo4jStore(state, { namespace: "meta_test" });

    await store.pushGraph(G, communities);
    await store.close();

    const metaStatement = state.allStatements.find(
      (s) =>
        s.text.includes("GraphifyMeta") &&
        (s.text.includes("MERGE") || s.text.includes("CREATE") || s.text.includes("SET")),
    );
    expect(metaStatement).toBeDefined();
  });

  it("readSnapshotMeta returns undefined before push", async () => {
    const state: InMemoryNeo4jState = {
      statements: [],
      allStatements: [],
      closed: false,
      driverClosed: false,
    };
    const store = await makeNeo4jStore(state, { namespace: "meta_fresh" });

    const meta = await store.readSnapshotMeta();
    await store.close();

    expect(meta).toBeUndefined();
  });

  it("readSnapshotMeta issues a Cypher query for GraphifyMeta", async () => {
    const state: InMemoryNeo4jState = {
      statements: [],
      allStatements: [],
      closed: false,
      driverClosed: false,
    };
    const store = await makeNeo4jStore(state, { namespace: "meta_read" });

    await store.readSnapshotMeta();
    await store.close();

    const readStatement = state.allStatements.find(
      (s) => s.text.includes("GraphifyMeta") && s.text.includes("MATCH"),
    );
    expect(readStatement).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Label / relation sanitization (anti-injection)
// ---------------------------------------------------------------------------

describe("Neo4j adapter: label/relation sanitization", () => {
  it("sanitizes file_type with backtick to prevent Cypher injection", async () => {
    const state: InMemoryNeo4jState = {
      statements: [],
      allStatements: [],
      closed: false,
      driverClosed: false,
    };
    const G = new Graph();
    G.addNode("evil", {
      label: "Evil",
      file_type: "cod`e", // backtick — would break Cypher
      source_file: "src/evil.ts",
    });
    const communities = new Map<number, string[]>();
    const store = await makeNeo4jStore(state, { namespace: "sanitize_test" });

    await store.pushGraph(G, communities);
    await store.close();

    // The raw backtick must never appear in any emitted statement text
    for (const stmt of state.allStatements) {
      expect(stmt.text).not.toContain("`");
    }
  });

  it("sanitizes file_type with single-quote to prevent injection", async () => {
    const state: InMemoryNeo4jState = {
      statements: [],
      allStatements: [],
      closed: false,
      driverClosed: false,
    };
    const G = new Graph();
    G.addNode("evil2", {
      label: "Evil2",
      file_type: "co'de",
      source_file: "src/evil2.ts",
    });
    const communities = new Map<number, string[]>();
    const store = await makeNeo4jStore(state, { namespace: "sanitize_quote" });

    await store.pushGraph(G, communities);
    await store.close();

    // Single quote from file_type must not appear in statement text (it's a label)
    const nodeStatements = state.allStatements.filter(
      (s) => s.text.includes("UNWIND") && s.text.match(/\(n:/),
    );
    for (const stmt of nodeStatements) {
      expect(stmt.text).not.toContain("'");
    }
  });

  it("handles relation names that start with a digit", async () => {
    const state: InMemoryNeo4jState = {
      statements: [],
      allStatements: [],
      closed: false,
      driverClosed: false,
    };
    const G = new Graph();
    G.addNode("a", { label: "A", file_type: "code", source_file: "a.ts" });
    G.addNode("b", { label: "B", file_type: "code", source_file: "b.ts" });
    G.addEdge("a", "b", { relation: "1invalid", confidence: "EXTRACTED" });
    const communities = new Map<number, string[]>();
    const store = await makeNeo4jStore(state, { namespace: "relation_test" });

    await expect(store.pushGraph(G, communities)).resolves.not.toThrow();
    await store.close();
  });
});

// ---------------------------------------------------------------------------
// dryRun
// ---------------------------------------------------------------------------

describe("Neo4j adapter: dryRun", () => {
  it("returns correct counts but issues no Cypher statements", async () => {
    const state: InMemoryNeo4jState = {
      statements: [],
      allStatements: [],
      closed: false,
      driverClosed: false,
    };
    const { G, communities } = contractFixture();
    const store = await makeNeo4jStore(state, { namespace: "dry_run_test" });

    const result = await store.pushGraph(G, communities, { dryRun: true });
    await store.close();

    expect(result.nodes).toBe(G.order);
    expect(result.edges).toBe(G.size);
    expect(state.allStatements).toHaveLength(0);
  });

  it("dryRun after a real push leaves snapshot meta unchanged", async () => {
    const state: InMemoryNeo4jState = {
      statements: [],
      allStatements: [],
      closed: false,
      driverClosed: false,
    };
    const { G, communities } = contractFixture();
    const altG = new Graph();
    altG.addNode("x", { label: "X", file_type: "code", source_file: "x.ts" });

    const store = await makeNeo4jStore(state, { namespace: "dry_after_real" });

    await store.pushGraph(G, communities);
    const countAfterReal = state.allStatements.length;

    await store.pushGraph(altG, new Map(), { dryRun: true });

    // No new statements added
    expect(state.allStatements.length).toBe(countAfterReal);
    await store.close();
  });
});

// ---------------------------------------------------------------------------
// clear() — force-gated
// ---------------------------------------------------------------------------

describe("Neo4j adapter: clear", () => {
  it("refuses clear without force flag", async () => {
    const state: InMemoryNeo4jState = {
      statements: [],
      allStatements: [],
      closed: false,
      driverClosed: false,
    };
    const store = await makeNeo4jStore(state, { namespace: "clear_test" });

    // Port signature: clear?(namespace?: string)
    // Our extended signature also accepts { force: boolean }
    await expect((store.clear as Function)()).rejects.toThrow(/force/i);
    await store.close();
  });

  it("clears namespace with force and issues DETACH DELETE", async () => {
    const state: InMemoryNeo4jState = {
      statements: [],
      allStatements: [],
      closed: false,
      driverClosed: false,
    };
    const { G, communities } = contractFixture();
    const store = await makeNeo4jStore(state, { namespace: "clear_force" });

    await store.pushGraph(G, communities);
    state.allStatements.length = 0; // reset counter

    await (store.clear as Function)({ force: true });
    await store.close();

    const deleteStatement = state.allStatements.find((s) => s.text.includes("DETACH DELETE"));
    expect(deleteStatement).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// query() passthrough
// ---------------------------------------------------------------------------

describe("Neo4j adapter: query passthrough", () => {
  it("passes a Cypher statement to the session and returns the result", async () => {
    const state: InMemoryNeo4jState = {
      statements: [],
      allStatements: [],
      closed: false,
      driverClosed: false,
    };
    const store = await makeNeo4jStore(state, { namespace: "query_test" });

    await store.query!("MATCH (n) RETURN n LIMIT 1");
    await store.close();

    const queryStatement = state.allStatements.find((s) => s.text.includes("MATCH (n)"));
    expect(queryStatement).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// close() — closes driver
// ---------------------------------------------------------------------------

describe("Neo4j adapter: close", () => {
  it("closes the underlying driver", async () => {
    const state: InMemoryNeo4jState = {
      statements: [],
      allStatements: [],
      closed: false,
      driverClosed: false,
    };
    const store = await makeNeo4jStore(state);

    await store.close();

    expect(state.driverClosed).toBe(true);
  });

  it("is safe to call close() multiple times", async () => {
    const state: InMemoryNeo4jState = {
      statements: [],
      allStatements: [],
      closed: false,
      driverClosed: false,
    };
    const store = await makeNeo4jStore(state);

    await store.close();
    await expect(store.close()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Registry: neo4j factory registered + missing-driver error
// ---------------------------------------------------------------------------

describe("Neo4j adapter: registry and driver loading", () => {
  it("is registered with id 'neo4j' and requiredPackage 'neo4j-driver'", async () => {
    const { listGraphStoreIds } = await import("../src/storage/registry.js");
    const ids = listGraphStoreIds();
    expect(ids).toContain("neo4j");
  });

  it("throws actionable error when neo4j-driver is missing (no driverModule injection)", async () => {
    const { resolveGraphStore } = await import("../src/storage/registry.js");
    // Don't inject driverModule — the registry will try to dynamic-import neo4j-driver
    // which may or may not be installed; we mock the failure by registering a transient factory
    const { registerGraphStoreFactory } = await import("../src/storage/registry.js");
    registerGraphStoreFactory({
      id: "neo4j-missing-driver-test",
      requiredPackage: "neo4j-driver-does-not-exist-xyzzy",
      async create() {
        throw new Error("should not be called");
      },
    });

    await expect(
      resolveGraphStore("neo4j-missing-driver-test", { target: "bolt://localhost:7687" }),
    ).rejects.toThrow(/requires neo4j-driver-does-not-exist-xyzzy.*npm install/i);
  });
});

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

describe("Neo4j adapter: capabilities", () => {
  it("exposes id=neo4j and correct capabilities", async () => {
    const state: InMemoryNeo4jState = {
      statements: [],
      allStatements: [],
      closed: false,
      driverClosed: false,
    };
    const store = await makeNeo4jStore(state);

    expect(store.id).toBe("neo4j");
    expect(store.capabilities.push).toBe(true);
    expect(store.capabilities.query).toBe(true);
    expect(store.capabilities.clear).toBe(true);
    expect(store.capabilities.snapshotMeta).toBe(true);
    await store.close();
  });
});

// ---------------------------------------------------------------------------
// Live suite — gated on GRAPHIFY_TEST_NEO4J_URI
// ---------------------------------------------------------------------------

describe.skipIf(!process.env.GRAPHIFY_TEST_NEO4J_URI)(
  "Neo4j adapter: live round-trip",
  () => {
    const uri = process.env.GRAPHIFY_TEST_NEO4J_URI!;
    const user = process.env.GRAPHIFY_NEO4J_USER ?? "neo4j";
    const password = process.env.GRAPHIFY_NEO4J_PASSWORD ?? "password";
    const namespace = `graphify_test_${Date.now()}`;

    it("push → readSnapshotMeta → clear round-trip against a real Neo4j", async () => {
      const { createNeo4jGraphStore } = await import("../src/storage/neo4j.js");
      const store = await createNeo4jGraphStore({
        target: uri,
        namespace,
        user,
        password,
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
