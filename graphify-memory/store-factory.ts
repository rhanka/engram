import type {
  CanonicalMemoryStoreFactoryV1,
  CanonicalMemoryStorePort,
  CapabilityAttestationIdentityV1,
  FencedStoreConstructionV1,
  MemoryOperation,
  OperationalCapabilityReceiptV1,
  Result,
} from "./contracts/index.js";

function refuse<T>(operation: MemoryOperation, code: "STORE_UNAVAILABLE" | "CAPABILITY_UNAVAILABLE", message: string): Result<T> {
  return { ok: false, error: { code, operation, message, retryable: false } };
}

/**
 * §5.9: the compiled adapter identity of THIS graphify-memory module build. It is a STORE-INDEPENDENT source of
 * truth — not derived from host configuration, which is the answer to the attestation tautology (a host that
 * misconfigures the store cannot also make its declared identity self-consistent against this constant). A
 * duplicate package (a second module instance) carries a distinct copy of this constant AND a distinct factory
 * registry below, so a cross-instance store is detected. `adapter_build_digest` is a build-time constant.
 */
export const GRAPHIFY_MEMORY_ADAPTER_IDENTITY: CapabilityAttestationIdentityV1 = {
  adapter_id: "graphify-memory/fenced-store",
  adapter_version: "1",
  adapter_build_digest: "sha256:0000000000000000000000000000000000000000000000000000000000000001",
};

/**
 * Module-private provenance registry — the in-process mark. A store built by THIS module's factory (after taking
 * the fence) is a member; a store from a duplicate module instance is not a member of THIS registry. This is the
 * only detector of §5.9 threat 3 ("never took the fence"), which a copyable string cannot prove.
 */
const fencedFactoryStores = new WeakSet<CanonicalMemoryStorePort>();

/** True iff `store` was built by a fenced-store factory of THIS graphify-memory module instance. */
export function isFencedFactoryStoreV1(store: CanonicalMemoryStorePort): boolean {
  return fencedFactoryStores.has(store);
}

/**
 * §5.9 provenance admission for a fencing-dependent operation. A non-production ("memory") store is admitted with
 * no mark. A production (sqlite/postgres) store is admitted only when (a) it was built by THIS module's fenced
 * factory (in-process membership — detects a duplicate package / a store that never took the fence) AND (b) its
 * receipt's declared adapter identity equals this module's compiled identity (version/build lockstep). No key,
 * no signature: the trust boundary is deployment topology, not cryptography.
 */
export function verifyStoreProvenance(
  store: CanonicalMemoryStorePort,
  receipt: OperationalCapabilityReceiptV1,
  operation: MemoryOperation,
): Result<OperationalCapabilityReceiptV1> {
  if (receipt.backend === "memory") return { ok: true, value: receipt };
  if (!fencedFactoryStores.has(store)) {
    return refuse(operation, "CAPABILITY_UNAVAILABLE", "canonical store was not built by this graphify-memory module instance (duplicate package, or a store that never took the fence?)");
  }
  if (receipt.adapter_id !== GRAPHIFY_MEMORY_ADAPTER_IDENTITY.adapter_id
    || receipt.adapter_version !== GRAPHIFY_MEMORY_ADAPTER_IDENTITY.adapter_version
    || receipt.adapter_build_digest !== GRAPHIFY_MEMORY_ADAPTER_IDENTITY.adapter_build_digest) {
    return refuse(operation, "CAPABILITY_UNAVAILABLE", "canonical store declares an adapter identity that does not match this graphify-memory build");
  }
  return { ok: true, value: receipt };
}

/** Constructs a fenced CanonicalMemoryStorePort, taking the storage fence (kernel flock / store-generation lock) at construction. */
export type FencedStoreOpenerV1 = (input: FencedStoreConstructionV1) => Promise<Result<CanonicalMemoryStorePort>>;

export interface CanonicalMemoryStoreFactoryOptionsV1 {
  /** Graphify wires its own sqlite/postgres openers here; the factory never re-implements the broker (§5.7). */
  readonly open: FencedStoreOpenerV1;
}

/**
 * Graphify-owned fenced-store factory (§5.7). Enforces the single-broker-instance rule (a second live holder is
 * refused STORE_UNAVAILABLE, never queued; released on graceful close()). It also stamps each acquired store with
 * this module's in-process provenance mark (§5.9) and makes readiness() declare this module's compiled adapter
 * identity; the underlying sqlite/postgres opener stays ignorant of both.
 */
export function createCanonicalMemoryStoreFactoryV1(options: CanonicalMemoryStoreFactoryOptionsV1): CanonicalMemoryStoreFactoryV1 {
  const liveHolders = new Set<string>();

  return {
    version: 1,
    adapter_id: GRAPHIFY_MEMORY_ADAPTER_IDENTITY.adapter_id,
    adapter_version: GRAPHIFY_MEMORY_ADAPTER_IDENTITY.adapter_version,
    async acquire(input: FencedStoreConstructionV1): Promise<Result<CanonicalMemoryStorePort>> {
      // in-process half of the single-broker rule: a second live holder is refused, never queued.
      if (liveHolders.has(input.store_id)) {
        return refuse("admin", "STORE_UNAVAILABLE", "a live broker instance already exists for this store in-process (single-broker rule; not queued)");
      }
      liveHolders.add(input.store_id); // reserve before opening so a concurrent acquire cannot slip past the check.
      let opened: Result<CanonicalMemoryStorePort>;
      try {
        opened = await options.open(input); // the opener takes the storage fence; a cross-process holder makes it refuse.
      } catch {
        liveHolders.delete(input.store_id);
        return refuse("admin", "STORE_UNAVAILABLE", "fenced store construction failed before taking the storage fence");
      }
      if (!opened.ok) {
        liveHolders.delete(input.store_id); // a failed acquisition holds no fence — free the in-process slot.
        return opened;
      }
      const marked = withProvenanceAndRelease(opened.value, () => liveHolders.delete(input.store_id));
      fencedFactoryStores.add(marked); // stamp the store the engine will hold, AFTER the fence was taken.
      return { ok: true, value: marked };
    },
  };
}

/**
 * Wraps an acquired store so that (a) `readiness()` declares this module's compiled adapter identity (no
 * signature, no digest) and (b) the in-process holder is released on graceful `close()`. Every other member
 * passes through untouched. The wrapped instance (not the raw store) is the one stamped into the registry.
 */
function withProvenanceAndRelease(store: CanonicalMemoryStorePort, release: () => void): CanonicalMemoryStorePort {
  return new Proxy(store, {
    get(target, prop, receiver) {
      if (prop === "readiness") {
        return async (): Promise<Result<OperationalCapabilityReceiptV1>> => {
          const base = await target.readiness();
          if (!base.ok) return base;
          return { ok: true, value: { ...base.value, adapter_id: GRAPHIFY_MEMORY_ADAPTER_IDENTITY.adapter_id, adapter_version: GRAPHIFY_MEMORY_ADAPTER_IDENTITY.adapter_version, adapter_build_digest: GRAPHIFY_MEMORY_ADAPTER_IDENTITY.adapter_build_digest } };
        };
      }
      if (prop === "close") {
        return async (): Promise<Result<{ closed: true }>> => {
          try {
            return await target.close();
          } finally {
            release();
          }
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
