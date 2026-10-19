import { describe, expect, it, vi } from "vitest";
import { createSqliteGraphStore } from "../src/storage/sqlite.js";
import { createPostgresGraphStore } from "../src/storage/postgres.js";
import { createSpannerGraphStore } from "../src/storage/spanner.js";
import { createNeo4jGraphStore } from "../src/storage/neo4j.js";
import { createPgVectorStore } from "../src/storage/vector/pgvector.js";
import { createPostgresExactVectorStore } from "../src/storage/vector/postgres-exact.js";
import { resolveGraphStore } from "../src/storage/registry.js";
import { resolveVectorStore } from "../src/storage/vector/registry.js";

// Reintroducing automatic loading must fail without opening a connection.
vi.mock("pg", () => { throw new Error("host driver was loaded by Engram"); });
vi.mock("neo4j-driver", () => { throw new Error("host driver was loaded by Engram"); });
vi.mock("@google-cloud/spanner", () => { throw new Error("host driver was loaded by Engram"); });

// Amendment §§1.4, 3.9, 5.7: installing a driver never grants Engram
// authority to load it. Direct factories and both registries require injection.
describe("host-owned storage drivers", () => {
  const config = { target: ":memory:", connectionString: "postgres://unused/db", instance: "instance", database: "database", embedding: { dimension: 3 } };
  it.each([
    ["sqlite", () => createSqliteGraphStore(config)],
    ["postgres", () => createPostgresGraphStore(config)],
    ["spanner", () => createSpannerGraphStore(config)],
    ["neo4j", () => createNeo4jGraphStore(config)],
    ["pgvector", () => createPgVectorStore(config)],
    ["postgres-exact", () => createPostgresExactVectorStore({ namespace: "host-driver", dimension: 3, connectionString: config.connectionString })],
    ...["sqlite", "postgres", "spanner", "neo4j"].map((kind) => [kind, () => resolveGraphStore(kind, config)] as const),
    ["pgvector", () => resolveVectorStore("pgvector", config)],
  ] as const)("refuses %s without an injected driver", async (_kind, open) => {
    await expect(open()).rejects.toMatchObject({ name: "HostDriverRequiredError", code: "HOST_DRIVER_REQUIRED", message: expect.stringContaining("the host must inject") });
  });
});
