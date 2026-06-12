/**
 * VectorStore registry — vector-store ids -> factories, with lazy driver
 * loading. A SEPARATE registry from the GraphStore registry (design decision
 * E4): vector mirrors have a distinct port (`VectorStore`) and distinct driver
 * set (`pg` + `pgvector`), so they get their own id-space and resolution path.
 *
 * Importing this module never evaluates a backend driver: drivers are
 * optionalDependencies resolved through dynamic import() at the moment a store
 * is resolved, mirroring `src/storage/registry.ts`. Registers `pgvector`.
 */
import { createPgVectorStore } from "./pgvector.js";
import type { VectorStore } from "./types.js";
import type { GraphStoreConfig } from "../types.js";
import type { PgVectorStoreDeps } from "./pgvector.js";

export interface VectorStoreFactory {
  readonly id: string;
  /**
   * npm packages resolved via dynamic import (e.g. ["pg", "pgvector"]); empty
   * when no driver is needed. The first entry is probed in the registry so the
   * actionable missing-driver error fires before the factory runs.
   */
  readonly requiredPackages: string[];
  create(config: GraphStoreConfig, deps?: PgVectorStoreDeps): Promise<VectorStore>;
}

const factories = new Map<string, VectorStoreFactory>();

export function registerVectorStoreFactory(factory: VectorStoreFactory): void {
  factories.set(factory.id, factory);
}

export function listVectorStoreIds(): string[] {
  return [...factories.keys()].sort();
}

/**
 * Resolve a vector-store id into a VectorStore instance. When the factory
 * declares required driver packages, the registry probes the dynamic import
 * here so every vector backend shares the same actionable missing-driver error.
 * `deps.driverModule` (tests only) bypasses the import entirely.
 */
export async function resolveVectorStore(
  id: string,
  config: GraphStoreConfig,
  deps?: PgVectorStoreDeps,
): Promise<VectorStore> {
  const factory = factories.get(id);
  if (!factory) {
    throw new Error(
      `unknown vector store '${id}'. Available: ${listVectorStoreIds().join(", ")}`,
    );
  }

  let resolvedDeps = deps;
  const primary = factory.requiredPackages[0];
  if (primary !== undefined && deps?.driverModule === undefined) {
    let driverModule: unknown;
    try {
      driverModule = await import(primary);
    } catch {
      const install = factory.requiredPackages.join(" ");
      throw new Error(
        `vector store '${factory.id}' requires ${primary}. ` +
          `Run: npm install ${install}`,
      );
    }
    resolvedDeps = { ...deps, driverModule };
  }

  return factory.create(config, resolvedDeps);
}

registerVectorStoreFactory({
  id: "pgvector",
  // pgvector needs the Postgres client (`pg`) plus the `pgvector` helper for
  // type registration; the client is the import probed by the registry.
  requiredPackages: ["pg", "pgvector"],
  async create(config: GraphStoreConfig, deps?: PgVectorStoreDeps): Promise<VectorStore> {
    return createPgVectorStore(
      config as Parameters<typeof createPgVectorStore>[0],
      deps,
    );
  },
});
