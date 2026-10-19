import { requireHostDriver } from "../host-driver.js";
/**
 * VectorStore registry — vector-store ids -> factories with host drivers.
 * A SEPARATE registry from the GraphStore registry (design decision
 * E4): vector mirrors have a distinct port (`VectorStore`) and distinct driver
 * set (`pg` + `pgvector`), so they get their own id-space and resolution path.
 *
 * Engram never imports a backend driver. Registers `pgvector`.
 */
import { createPgVectorStore } from "./pgvector.js";
import type { VectorStore } from "./types.js";
import type { GraphStoreConfig } from "../types.js";
import type { PgVectorStoreDeps } from "./pgvector.js";

export interface VectorStoreFactory {
  readonly id: string;
  /**
   * Host-owned driver identities (e.g. ["pg", "pgvector"]); empty when no
   * driver is needed. The host supplies the primary module via driverModule.
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
 * Resolve a vector store with the host's driver, refusing before the factory
 * runs if the required primary driver was not supplied.
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

  const primary = factory.requiredPackages[0];
  if (primary !== undefined) requireHostDriver(factory.id, primary, deps?.driverModule);

  return factory.create(config, deps);
}

registerVectorStoreFactory({
  id: "pgvector",
  // pgvector needs the Postgres client (`pg`) plus the `pgvector` helper for
  // type registration; the client is supplied by the host.
  requiredPackages: ["pg", "pgvector"],
  async create(config: GraphStoreConfig, deps?: PgVectorStoreDeps): Promise<VectorStore> {
    return createPgVectorStore(
      config as Parameters<typeof createPgVectorStore>[0],
      deps,
    );
  },
});
