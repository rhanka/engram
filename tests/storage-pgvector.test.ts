/**
 * pgvector VectorStore adapter tests (GraphRAG VECTOR backend).
 *
 * Every test uses an in-memory fake `pg` module injected via driverModule and a
 * deterministic stub EmbeddingProvider — no real Postgres and no network model
 * call. The assertions lock the SQL the adapter emits: ON CONFLICT upsert, the
 * cosine ORDER BY query, the dimension guard, and dryRun no-writes. A live suite
 * at the bottom runs only when GRAPHIFY_TEST_POSTGRES_URL is set.
 */
import { describe, expect, it } from "vitest";
import type {
  EmbeddingProvider,
  EmbeddingVector,
  VectorStore,
} from "../src/storage/vector/types.js";
import type { PgVectorStoreDeps } from "../src/storage/vector/pgvector.js";

// ---------------------------------------------------------------------------
// Fake `pg` driver infrastructure
// ---------------------------------------------------------------------------

interface RecordedQuery {
  text: string;
  values?: unknown[];
}

/** In-memory state for the fake pg backend. */
interface InMemoryPgState {
  /** Every client.query() call, in order. */
  queries: RecordedQuery[];
  /** Rows the next SELECT query should return. */
  selectRows: Array<Record<string, unknown>>;
  ended: boolean;
}

function freshState(): InMemoryPgState {
  return { queries: [], selectRows: [], ended: false };
}

function makeFakePgModule(state: InMemoryPgState) {
  class FakePool {
    constructor(_config: { connectionString?: string; ssl?: unknown }) {}
    query(text: string, values?: unknown[]) {
      state.queries.push({ text, values });
      // Return configured rows for the SELECT (similarity) query, else empty.
      if (/^\s*SELECT\s+node_id/i.test(text)) {
        return Promise.resolve({ rows: state.selectRows });
      }
      return Promise.resolve({ rows: [] });
    }
    end() {
      state.ended = true;
      return Promise.resolve();
    }
  }
  return { Pool: FakePool };
}

// ---------------------------------------------------------------------------
// Deterministic stub EmbeddingProvider (hermetic — no network)
// ---------------------------------------------------------------------------

function stubProvider(dimension: number, id = "stub"): EmbeddingProvider {
  return {
    id,
    dimension,
    async embed(texts: string[]): Promise<number[][]> {
      // Deterministic: char-code sums spread across the dimension.
      return texts.map((t) => {
        const v = new Array<number>(dimension).fill(0);
        for (let i = 0; i < t.length; i++) {
          v[i % dimension] += t.charCodeAt(i);
        }
        return v;
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Store builder
// ---------------------------------------------------------------------------

const DIM = 4;

async function makePgVectorStore(
  state: InMemoryPgState,
  overrides?: {
    dimension?: number;
    namespace?: string;
    citySlug?: string;
    ssl?: boolean;
    embeddingProvider?: EmbeddingProvider;
  },
): Promise<VectorStore> {
  const { createPgVectorStore } = await import("../src/storage/vector/pgvector.js");
  const dimension = overrides?.dimension ?? DIM;
  const deps: PgVectorStoreDeps = {
    driverModule: makeFakePgModule(state),
    ...(overrides?.embeddingProvider
      ? { embeddingProvider: overrides.embeddingProvider }
      : {}),
  };
  return createPgVectorStore(
    {
      connectionString: "postgres://user:pass@localhost:5432/graphify",
      embedding: { provider: "stub", model: "stub-model", dimension },
      namespace: overrides?.namespace ?? "test_city",
      ...(overrides?.citySlug ? { citySlug: overrides.citySlug } : {}),
      ...(overrides?.ssl !== undefined ? { ssl: overrides.ssl } : {}),
    },
    deps,
  );
}

function vec(id: string, vector: number[], extra?: Partial<EmbeddingVector>): EmbeddingVector {
  return { id, vector, ...extra };
}

/** Find the first recorded query whose text matches a predicate. */
function findQuery(state: InMemoryPgState, pred: (t: string) => boolean): RecordedQuery | undefined {
  return state.queries.find((q) => pred(q.text));
}

// ---------------------------------------------------------------------------
// Capabilities + construction guards
// ---------------------------------------------------------------------------

describe("pgvector adapter: construction + capabilities", () => {
  it("exposes id=pgvector, dimension, and cosine capabilities", async () => {
    const state = freshState();
    const store = await makePgVectorStore(state);
    expect(store.id).toBe("pgvector");
    expect(store.dimension).toBe(DIM);
    expect(store.capabilities.upsert).toBe(true);
    expect(store.capabilities.query).toBe(true);
    expect(store.capabilities.clear).toBe(true);
    expect(store.capabilities.metrics).toEqual(["cosine"]);
    await store.close();
  });

  it("requires a connection string", async () => {
    const { createPgVectorStore } = await import("../src/storage/vector/pgvector.js");
    await expect(
      createPgVectorStore(
        { embedding: { dimension: DIM } },
        { driverModule: makeFakePgModule(freshState()) },
      ),
    ).rejects.toThrow(/connection string|GRAPHIFY_POSTGRES_URL/i);
  });

  it("requires a positive embedding dimension", async () => {
    const { createPgVectorStore } = await import("../src/storage/vector/pgvector.js");
    await expect(
      createPgVectorStore(
        { connectionString: "postgres://localhost/db" },
        { driverModule: makeFakePgModule(freshState()) },
      ),
    ).rejects.toThrow(/dimension/i);
  });

  it("rejects a provider whose dimension disagrees with the store", async () => {
    const state = freshState();
    await expect(
      makePgVectorStore(state, { embeddingProvider: stubProvider(DIM + 1) }),
    ).rejects.toThrow(/dimension mismatch/i);
  });

  it("accepts a provider whose dimension matches the store", async () => {
    const state = freshState();
    const store = await makePgVectorStore(state, {
      embeddingProvider: stubProvider(DIM),
    });
    expect(store.dimension).toBe(DIM);
    await store.close();
  });
});

// ---------------------------------------------------------------------------
// DDL — single source of truth
// ---------------------------------------------------------------------------

describe("pgvector adapter: DDL", () => {
  it("emits the vector extension, graph_embeddings table, and hnsw index", async () => {
    const { pgVectorDdl } = await import("../src/storage/vector/pgvector.js");
    const ddl = pgVectorDdl(384).join("\n");
    expect(ddl).toContain("CREATE EXTENSION IF NOT EXISTS vector");
    expect(ddl).toContain("CREATE TABLE IF NOT EXISTS graph_embeddings");
    expect(ddl).toContain("node_id text");
    expect(ddl).toContain("city_slug text");
    expect(ddl).toContain("embedding vector(384)");
    expect(ddl).toContain("metadata jsonb");
    expect(ddl).toContain("PRIMARY KEY (city_slug, node_id)");
    expect(ddl).toContain("USING hnsw (embedding vector_cosine_ops)");
  });

  it("bakes the configured dimension into vector(N)", async () => {
    const { pgVectorDdl } = await import("../src/storage/vector/pgvector.js");
    expect(pgVectorDdl(1536).join("\n")).toContain("vector(1536)");
  });

  it("rejects a non-positive dimension", async () => {
    const { pgVectorDdl } = await import("../src/storage/vector/pgvector.js");
    expect(() => pgVectorDdl(0)).toThrow(/dimension/i);
  });

  it("runs the DDL on first push (extension + table + index)", async () => {
    const state = freshState();
    const store = await makePgVectorStore(state);
    await store.upsertVectors([vec("a", [1, 0, 0, 0])]);
    await store.close();

    expect(findQuery(state, (t) => t.includes("CREATE EXTENSION IF NOT EXISTS vector"))).toBeDefined();
    expect(findQuery(state, (t) => t.includes("CREATE TABLE IF NOT EXISTS graph_embeddings"))).toBeDefined();
    expect(findQuery(state, (t) => t.includes("USING hnsw"))).toBeDefined();
  });

  it("ensures schema only once across multiple upserts", async () => {
    const state = freshState();
    const store = await makePgVectorStore(state);
    await store.upsertVectors([vec("a", [1, 0, 0, 0])]);
    await store.upsertVectors([vec("b", [0, 1, 0, 0])]);
    await store.close();

    const extensionStmts = state.queries.filter((q) =>
      q.text.includes("CREATE EXTENSION IF NOT EXISTS vector"),
    );
    expect(extensionStmts).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// upsertVectors — INSERT ... ON CONFLICT DO UPDATE
// ---------------------------------------------------------------------------

describe("pgvector adapter: upsertVectors", () => {
  it("emits INSERT ... ON CONFLICT (city_slug, node_id) DO UPDATE", async () => {
    const state = freshState();
    const store = await makePgVectorStore(state);
    const result = await store.upsertVectors([
      vec("a", [1, 0, 0, 0], { metadata: { kind: "code" } }),
      vec("b", [0, 1, 0, 0]),
    ]);
    await store.close();

    const insert = findQuery(state, (t) => t.startsWith("INSERT INTO graph_embeddings"));
    expect(insert).toBeDefined();
    expect(insert!.text).toContain("(node_id, city_slug, embedding, metadata)");
    expect(insert!.text).toContain("ON CONFLICT (city_slug, node_id) DO UPDATE");
    expect(insert!.text).toContain("embedding = EXCLUDED.embedding");
    expect(insert!.text).toContain("metadata = EXCLUDED.metadata");
    // pgvector literal + jsonb casts present.
    expect(insert!.text).toContain("::vector");
    expect(insert!.text).toContain("::jsonb");
    expect(result.count).toBe(2);
    expect(result.warnings).toEqual([]);
  });

  it("binds node_id, city_slug, vector literal, and metadata as params", async () => {
    const state = freshState();
    const store = await makePgVectorStore(state, { namespace: "ns1" });
    await store.upsertVectors([vec("alpha", [1, 2, 3, 4], { metadata: { n: 1 } })]);
    await store.close();

    const insert = findQuery(state, (t) => t.startsWith("INSERT INTO graph_embeddings"))!;
    expect(insert.values).toEqual(["alpha", "ns1", "[1,2,3,4]", JSON.stringify({ n: 1 })]);
  });

  it("uses the per-vector namespace when present, else the store namespace", async () => {
    const state = freshState();
    const store = await makePgVectorStore(state, { namespace: "store_ns" });
    await store.upsertVectors([
      vec("a", [1, 0, 0, 0]),
      vec("b", [0, 1, 0, 0], { namespace: "row_ns" }),
    ]);
    await store.close();

    const insert = findQuery(state, (t) => t.startsWith("INSERT INTO graph_embeddings"))!;
    // values = [id,ns,vec,meta] per row, 4 params each.
    expect(insert.values![1]).toBe("store_ns");
    expect(insert.values![5]).toBe("row_ns");
  });

  it("stores null metadata when none is provided", async () => {
    const state = freshState();
    const store = await makePgVectorStore(state);
    await store.upsertVectors([vec("a", [1, 0, 0, 0])]);
    await store.close();

    const insert = findQuery(state, (t) => t.startsWith("INSERT INTO graph_embeddings"))!;
    expect(insert.values![3]).toBeNull();
  });

  it("batches rows by batchSize into multiple INSERTs", async () => {
    const state = freshState();
    const store = await makePgVectorStore(state);
    const vectors = Array.from({ length: 5 }, (_, i) => vec(`n${i}`, [i, 0, 0, 0]));
    const result = await store.upsertVectors(vectors, { batchSize: 2 });
    await store.close();

    const inserts = state.queries.filter((q) => q.text.startsWith("INSERT INTO graph_embeddings"));
    expect(inserts).toHaveLength(3); // 2 + 2 + 1
    expect(result.count).toBe(5);
  });

  it("replace mode deletes the namespace before loading", async () => {
    const state = freshState();
    const store = await makePgVectorStore(state, { namespace: "rep_ns" });
    await store.upsertVectors([vec("a", [1, 0, 0, 0])], { mode: "replace" });
    await store.close();

    const del = findQuery(
      state,
      (t) => t.includes("DELETE FROM graph_embeddings") && t.includes("city_slug"),
    );
    expect(del).toBeDefined();
    expect(del!.values).toEqual(["rep_ns"]);
  });

  it("merge mode (default) issues no DELETE", async () => {
    const state = freshState();
    const store = await makePgVectorStore(state);
    await store.upsertVectors([vec("a", [1, 0, 0, 0])]);
    await store.close();

    expect(findQuery(state, (t) => t.includes("DELETE FROM"))).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Dimension guard
// ---------------------------------------------------------------------------

describe("pgvector adapter: dimension guard", () => {
  it("rejects an upsert vector with the wrong length before any write", async () => {
    const state = freshState();
    const store = await makePgVectorStore(state);
    await expect(
      store.upsertVectors([vec("bad", [1, 0, 0])]), // 3 != 4
    ).rejects.toThrow(/dimension mismatch/i);
    // No INSERT and no DDL ran.
    expect(state.queries).toHaveLength(0);
    await store.close();
  });

  it("rejects a query vector with the wrong length", async () => {
    const state = freshState();
    const store = await makePgVectorStore(state);
    await expect(
      store.query!({ vector: [1, 0, 0, 0, 0] }), // 5 != 4
    ).rejects.toThrow(/dimension mismatch/i);
    await store.close();
  });
});

// ---------------------------------------------------------------------------
// query — cosine similarity ORDER BY
// ---------------------------------------------------------------------------

describe("pgvector adapter: query (cosine)", () => {
  it("emits 1-(embedding <=> $1) score, cosine ORDER BY, and LIMIT topK", async () => {
    const state = freshState();
    state.selectRows = [
      { node_id: "a", city_slug: "test_city", metadata: { kind: "code" }, score: 0.97 },
      { node_id: "b", city_slug: "test_city", metadata: null, score: 0.5 },
    ];
    const store = await makePgVectorStore(state);
    const matches = await store.query!({ vector: [1, 0, 0, 0], topK: 5 });
    await store.close();

    const sel = findQuery(state, (t) => t.includes("SELECT node_id"))!;
    expect(sel.text).toContain("1 - (embedding <=> $1::vector) AS score");
    expect(sel.text).toContain("ORDER BY embedding <=> $1::vector");
    expect(sel.text).toMatch(/LIMIT \$\d+/);
    // params: [vectorLiteral, topK] (no namespace filter here).
    expect(sel.values![0]).toBe("[1,0,0,0]");
    expect(sel.values![sel.values!.length - 1]).toBe(5);

    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({ id: "a", score: 0.97, namespace: "test_city" });
    expect(matches[0].metadata).toEqual({ kind: "code" });
    expect(matches[1].metadata).toBeUndefined();
  });

  it("defaults topK to 10 when omitted", async () => {
    const state = freshState();
    const store = await makePgVectorStore(state);
    await store.query!({ vector: [1, 0, 0, 0] });
    await store.close();

    const sel = findQuery(state, (t) => t.includes("SELECT node_id"))!;
    expect(sel.values![sel.values!.length - 1]).toBe(10);
  });

  it("adds a WHERE city_slug filter when namespace is given", async () => {
    const state = freshState();
    const store = await makePgVectorStore(state);
    await store.query!({ vector: [1, 0, 0, 0], namespace: "other_city", topK: 3 });
    await store.close();

    const sel = findQuery(state, (t) => t.includes("SELECT node_id"))!;
    expect(sel.text).toContain("WHERE city_slug = $2");
    // params: [vectorLiteral, namespace, topK].
    expect(sel.values).toEqual(["[1,0,0,0]", "other_city", 3]);
  });

  it("accepts a city_slug filter via the filter bag", async () => {
    const state = freshState();
    const store = await makePgVectorStore(state);
    await store.query!({ vector: [1, 0, 0, 0], filter: { city_slug: "f_city" } });
    await store.close();

    const sel = findQuery(state, (t) => t.includes("SELECT node_id"))!;
    expect(sel.text).toContain("WHERE city_slug = $2");
    expect(sel.values![1]).toBe("f_city");
  });
});

// ---------------------------------------------------------------------------
// dryRun — no writes
// ---------------------------------------------------------------------------

describe("pgvector adapter: dryRun", () => {
  it("returns the count but performs no schema/insert/delete", async () => {
    const state = freshState();
    const store = await makePgVectorStore(state);
    const result = await store.upsertVectors(
      [vec("a", [1, 0, 0, 0]), vec("b", [0, 1, 0, 0])],
      { dryRun: true },
    );
    await store.close();

    expect(result.count).toBe(2);
    expect(state.queries).toHaveLength(0);
  });

  it("still applies the dimension guard before short-circuiting", async () => {
    const state = freshState();
    const store = await makePgVectorStore(state);
    await expect(
      store.upsertVectors([vec("bad", [1, 0])], { dryRun: true }),
    ).rejects.toThrow(/dimension mismatch/i);
    await store.close();
  });
});

// ---------------------------------------------------------------------------
// clear + close + verifyConnection
// ---------------------------------------------------------------------------

describe("pgvector adapter: clear / close / verify", () => {
  it("clear deletes the namespace rows", async () => {
    const state = freshState();
    const store = await makePgVectorStore(state, { namespace: "clr" });
    await store.clear!();
    await store.close();

    const del = findQuery(
      state,
      (t) => t.includes("DELETE FROM graph_embeddings") && t.includes("city_slug"),
    );
    expect(del).toBeDefined();
    expect(del!.values).toEqual(["clr"]);
  });

  it("clear accepts an explicit target namespace", async () => {
    const state = freshState();
    const store = await makePgVectorStore(state, { namespace: "default" });
    await store.clear!("explicit");
    await store.close();

    const del = findQuery(state, (t) => t.includes("DELETE FROM graph_embeddings"))!;
    expect(del.values).toEqual(["explicit"]);
  });

  it("verifyConnection runs a cheap round-trip", async () => {
    const state = freshState();
    const store = await makePgVectorStore(state);
    await store.verifyConnection();
    await store.close();
    expect(findQuery(state, (t) => /SELECT 1/.test(t))).toBeDefined();
  });

  it("close ends the pool and is idempotent", async () => {
    const state = freshState();
    const store = await makePgVectorStore(state);
    await store.close();
    expect(state.ended).toBe(true);
    await expect(store.close()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Deterministic stub provider sanity
// ---------------------------------------------------------------------------

describe("pgvector adapter: stub EmbeddingProvider", () => {
  it("is deterministic and emits store-dimension vectors (hermetic)", async () => {
    const provider = stubProvider(DIM);
    const [a1] = await provider.embed(["hello"]);
    const [a2] = await provider.embed(["hello"]);
    expect(a1).toEqual(a2);
    expect(a1).toHaveLength(DIM);
  });
});

// ---------------------------------------------------------------------------
// Vector registry
// ---------------------------------------------------------------------------

describe("pgvector adapter: vector registry", () => {
  it("registers id 'pgvector' in the separate vector registry", async () => {
    const { listVectorStoreIds } = await import("../src/storage/vector/registry.js");
    expect(listVectorStoreIds()).toContain("pgvector");
  });

  it("resolves pgvector through the registry with an injected driver", async () => {
    const { resolveVectorStore } = await import("../src/storage/vector/registry.js");
    const state = freshState();
    const store = await resolveVectorStore(
      "pgvector",
      {
        connectionString: "postgres://localhost/db",
        embedding: { dimension: DIM },
      },
      { driverModule: makeFakePgModule(state) },
    );
    expect(store.id).toBe("pgvector");
    await store.close();
  });

  it("throws an actionable error when the driver package is missing", async () => {
    const { resolveVectorStore, registerVectorStoreFactory } = await import(
      "../src/storage/vector/registry.js"
    );
    registerVectorStoreFactory({
      id: "pgvector-missing-driver-test",
      requiredPackages: ["pg-does-not-exist-xyzzy", "pgvector"],
      async create() {
        throw new Error("should not be called");
      },
    });

    await expect(
      resolveVectorStore("pgvector-missing-driver-test", {
        connectionString: "postgres://localhost/db",
        embedding: { dimension: DIM },
      }),
    ).rejects.toThrow(/requires pg-does-not-exist-xyzzy.*npm install pg-does-not-exist-xyzzy pgvector/i);
  });

  it("throws on an unknown vector store id", async () => {
    const { resolveVectorStore } = await import("../src/storage/vector/registry.js");
    await expect(
      resolveVectorStore("nope", { embedding: { dimension: DIM } }),
    ).rejects.toThrow(/unknown vector store 'nope'/i);
  });
});

// ---------------------------------------------------------------------------
// Live suite — gated on GRAPHIFY_TEST_POSTGRES_URL
// ---------------------------------------------------------------------------

describe.skipIf(!process.env.GRAPHIFY_TEST_POSTGRES_URL)(
  "pgvector adapter: live round-trip (Postgres + pgvector)",
  () => {
    const namespace = `graphify_test_${Date.now()}`;

    it("upsert → query → clear round-trip against a real backend", async () => {
      const { createPgVectorStore } = await import("../src/storage/vector/pgvector.js");
      const dimension = 4;
      const store = await createPgVectorStore({
        connectionString: process.env.GRAPHIFY_TEST_POSTGRES_URL,
        embedding: { dimension },
        namespace,
      });

      try {
        await store.verifyConnection();

        await store.upsertVectors(
          [
            vec("a", [1, 0, 0, 0], { metadata: { kind: "code" } }),
            vec("b", [0, 1, 0, 0]),
          ],
          { mode: "replace" },
        );

        const matches = await store.query!({ vector: [1, 0, 0, 0], topK: 2, namespace });
        expect(matches.length).toBeGreaterThan(0);
        expect(matches[0].id).toBe("a");
        expect(matches[0].score).toBeGreaterThan(0.9);

        await store.clear!(namespace);
        const cleared = await store.query!({ vector: [1, 0, 0, 0], namespace });
        expect(cleared).toHaveLength(0);
      } finally {
        await store.close();
      }
    });
  },
);
