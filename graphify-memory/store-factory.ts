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
 * §5.9: the compiled adapter identity of THIS graphify-memory module build. It is INFORMATIONAL — a store built
 * by the factory declares it on readiness() so a diagnostic (a duplicate package, a version drift) is legible in
 * the receipt. It is deliberately NOT the admission test: a copyable string is forgeable, so the gate turns on
 * the in-process mark below, never on this constant. `adapter_build_digest` is a build-time constant.
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

/**
 * Module-private registry of the neutral in-memory canonical store (createInMemoryCanonicalMemoryStoreV1). It is
 * the ONLY thing that makes a store eligible for the unfenced exemption, and only in tandem with the host's
 * `allow_unfenced_memory_store` opt-in — see verifyStoreProvenance. Membership is by object identity, so a bare
 * store that merely declares `backend: "memory"` is not a member and cannot bypass the fence.
 */
const inMemoryStores = new WeakSet<CanonicalMemoryStorePort>();

/**
 * INTERNAL (never re-exported from the package barrel, never in package.json `exports`): stamp a store as this
 * module's neutral in-memory store. createInMemoryCanonicalMemoryStoreV1 calls it on construction; a host cannot
 * reach it, and even if it could, the mark is inert unless the host also raised `allow_unfenced_memory_store`.
 */
export function markInMemoryStoreV1(store: CanonicalMemoryStorePort): void {
  inMemoryStores.add(store);
}

/**
 * INTERNAL (the package barrel does not re-export it, and package.json `exports` omits ./store-factory, so a host
 * cannot reach it): stamp a store as having taken THIS build's real kernel writer fence. Only the sqlite/postgres
 * opener calls it, and ONLY after acquiring a live fence (sqlite flock on the DB inode + /proc proof; postgres
 * advisory-lock generation). A store that never took the fence is never marked, so the gate refuses it — this is
 * what makes the §5.9 threat-3 store ("never took the fence") detectable, replacing the retired self-declared
 * `fenced_single_writer` boolean.
 */
export function markFencedStoreV1(store: CanonicalMemoryStorePort): void {
  fencedFactoryStores.add(store);
}

/** True iff `store` was built by a fenced-store factory of THIS graphify-memory module instance. */
export function isFencedFactoryStoreV1(store: CanonicalMemoryStorePort): boolean {
  return fencedFactoryStores.has(store);
}

/**
 * §5.9 provenance admission for a fencing-dependent operation. Two admit paths, and the decision NEVER reads the
 * receipt's `backend` string (forgeable):
 *   1. PRODUCTION — the store was built by THIS module's fenced factory (in-process membership; detects a
 *      duplicate package / a store that never took the fence) AND its receipt reports a live single-writer fence.
 *   2. NON-PRODUCTION EXEMPTION — the store is this module's neutral in-memory store (membership) AND the host
 *      raised `allowUnfencedMemoryStore`. BOTH are required: the flag alone would exempt any unfenced store
 *      (including a lock-less SQLite writing a real file), and membership alone would let an in-memory store run
 *      in production. Everything else is refused (production fails closed). No key, no signature: the trust
 *      boundary is deployment topology, not cryptography.
 */
export function verifyStoreProvenance(
  store: CanonicalMemoryStorePort,
  receipt: OperationalCapabilityReceiptV1,
  options: { allowUnfencedMemoryStore: boolean },
  operation: MemoryOperation,
): Result<OperationalCapabilityReceiptV1> {
  if (fencedFactoryStores.has(store)) {
    // Membership here means the opener took a REAL writer fence and stamped the store (sqlite flock on the DB
    // inode + /proc proof, or the postgres advisory-lock generation); the store re-proves liveness per op via its
    // own #fence. We deliberately do NOT gate on receipt.capabilities.fenced_single_writer — a self-declared
    // boolean is the same forgeable family as the retired backend string (F1). The kernel fence is the trust root.
    return { ok: true, value: receipt };
  }
  if (options.allowUnfencedMemoryStore && inMemoryStores.has(store)) {
    return { ok: true, value: receipt };
  }
  return refuse(operation, "CAPABILITY_UNAVAILABLE", "canonical store was not built by this graphify-memory module instance, and it is not an embedded in-memory store the host opted into via allow_unfenced_memory_store (duplicate package, a store that never took the fence, or an unfenced store in production?)");
}

/** Constructs a fenced CanonicalMemoryStorePort, taking the storage fence (kernel flock / store-generation lock) at construction. */
export type FencedStoreOpenerV1 = (input: FencedStoreConstructionV1) => Promise<Result<CanonicalMemoryStorePort>>;

export interface CanonicalMemoryStoreFactoryOptionsV1 {
  /** Graphify wires its own sqlite/postgres openers here; the factory never re-implements the broker (§5.7). */
  readonly open: FencedStoreOpenerV1;
}

/**
 * Graphify-owned fenced-store factory (§5.7). Enforces the single-broker-instance rule (a second live holder is
 * refused STORE_UNAVAILABLE, never queued; released on graceful close()). It PROPAGATES the opener's §5.9 fence
 * mark to the wrapper it returns (the opener stamps only after a real kernel fence) and makes readiness() declare
 * this module's compiled adapter identity; the underlying sqlite/postgres opener owns the fence and the stamp.
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
      // §5.9 v5-b: the factory does NOT vouch for the store on its own — it PROPAGATES the opener's fence mark to
      // the wrapper the engine will hold. The opener (sqlite/postgres) stamps the raw store only after a real
      // kernel fence, so a store that never took the fence (a bare/fake opener) stays unmarked and is refused.
      if (fencedFactoryStores.has(opened.value)) fencedFactoryStores.add(marked);
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
