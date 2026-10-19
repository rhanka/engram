import { requireHostDriver } from "./host-driver.js";
/**
 * GraphStore registry — store ids -> factories. Backend drivers belong to
 * the host and must be injected (public-substrate amendment §§3.9, 5.7).
 */
import { createFileGraphStore } from "./file.js";
import { createNeo4jGraphStore } from "./neo4j.js";
import { createPostgresGraphStore } from "./postgres.js";
import { createSpannerGraphStore } from "./spanner.js";
import { createSqliteGraphStore } from "./sqlite.js";
import { engramEnv } from "../env.js";
import type { GraphStore, GraphStoreConfig, StoreTestDeps } from "./types.js";

export interface GraphStoreFactory {
  readonly id: string;
  /** Host-owned driver package identity; empty when no driver is needed. */
  readonly requiredPackage: string;
  create(config: GraphStoreConfig, deps?: StoreTestDeps): Promise<GraphStore>;
}

const factories = new Map<string, GraphStoreFactory>();

export function registerGraphStoreFactory(factory: GraphStoreFactory): void {
  factories.set(factory.id, factory);
}

export function listGraphStoreIds(): string[] {
  return [...factories.keys()].sort();
}

/**
 * Resolve a store id with the host's injected driver, refusing before the
 * factory runs if a required driver was not supplied.
 */
export async function resolveGraphStore(
  id: string,
  config: GraphStoreConfig,
  deps?: StoreTestDeps,
): Promise<GraphStore> {
  const factory = factories.get(id);
  if (!factory) {
    throw new Error(`unknown store '${id}'. Available: ${listGraphStoreIds().join(", ")}`);
  }

  if (factory.requiredPackage) requireHostDriver(factory.id, factory.requiredPackage, deps?.driverModule);

  return factory.create(config, deps);
}

registerGraphStoreFactory({
  id: "file",
  // Built-in reference store: no driver package to load.
  requiredPackage: "",
  async create(config) {
    return createFileGraphStore(config);
  },
});

registerGraphStoreFactory({
  id: "neo4j",
  requiredPackage: "neo4j-driver",
  async create(config: GraphStoreConfig, deps?: StoreTestDeps): Promise<GraphStore> {
    if (!config.target) {
      throw new Error("neo4j store requires config.target (bolt URI)");
    }
    return createNeo4jGraphStore(
      config as Parameters<typeof createNeo4jGraphStore>[0],
      deps,
    );
  },
});

registerGraphStoreFactory({
  id: "spanner",
  requiredPackage: "@google-cloud/spanner",
  async create(config: GraphStoreConfig, deps?: StoreTestDeps): Promise<GraphStore> {
    return createSpannerGraphStore(
      config as Parameters<typeof createSpannerGraphStore>[0],
      deps,
    );
  },
});

registerGraphStoreFactory({
  id: "postgres",
  requiredPackage: "pg",
  async create(config: GraphStoreConfig, deps?: StoreTestDeps): Promise<GraphStore> {
    if (!config.connectionString && !engramEnv("ENGRAM_POSTGRES_URL", "GRAPHIFY_POSTGRES_URL")) {
      throw new Error(
        "postgres store requires a DSN (ENGRAM_POSTGRES_URL or config.connectionString)",
      );
    }
    return createPostgresGraphStore(
      config as Parameters<typeof createPostgresGraphStore>[0],
      deps,
    );
  },
});

registerGraphStoreFactory({
  id: "sqlite",
  requiredPackage: "better-sqlite3",
  async create(config: GraphStoreConfig, deps?: StoreTestDeps): Promise<GraphStore> {
    if (!config.target) {
      throw new Error("sqlite store requires config.target (path of the SQLite database file)");
    }
    return createSqliteGraphStore(
      config as Parameters<typeof createSqliteGraphStore>[0],
      deps,
    );
  },
});
