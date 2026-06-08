/**
 * GraphStore registry — store ids -> factories, with lazy driver loading
 * (SPEC_STORAGE_BACKENDS.md, "Store Registry And Driver Loading").
 *
 * Importing this module never evaluates a backend driver: drivers are
 * optionalDependencies resolved through dynamic import() at the moment a
 * store is resolved, generalizing the existing neo4j-driver / chokidar
 * pattern. PR2 registers only `file`; live backends follow (neo4j in PR3).
 */
import { createFileGraphStore } from "./file.js";
import type { GraphStore, GraphStoreConfig, StoreTestDeps } from "./types.js";

export interface GraphStoreFactory {
  readonly id: string;
  /** npm package resolved via dynamic import, e.g. "neo4j-driver"; empty when no driver is needed */
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
 * Resolve a store id into a GraphStore instance. When the factory declares a
 * required driver package, the registry probes the dynamic import here so
 * every backend shares the same actionable missing-driver error.
 * `deps.driverModule` (tests only) bypasses the import entirely.
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

  let resolvedDeps = deps;
  if (factory.requiredPackage && deps?.driverModule === undefined) {
    let driverModule: unknown;
    try {
      driverModule = await import(factory.requiredPackage);
    } catch {
      throw new Error(
        `store '${factory.id}' requires ${factory.requiredPackage}. ` +
          `Run: npm install ${factory.requiredPackage}`,
      );
    }
    resolvedDeps = { ...deps, driverModule };
  }

  return factory.create(config, resolvedDeps);
}

registerGraphStoreFactory({
  id: "file",
  // Built-in reference store: no driver package to load.
  requiredPackage: "",
  async create(config) {
    return createFileGraphStore(config);
  },
});
