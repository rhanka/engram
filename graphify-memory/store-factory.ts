import type {
  CanonicalMemoryStoreFactoryV1,
  CanonicalMemoryStorePort,
  FencedStoreConstructionV1,
  MemoryOperation,
  OpaqueRef,
  Result,
} from "./contracts/index.js";

function storeUnavailable<T>(operation: MemoryOperation, message: string): Result<T> {
  return { ok: false, error: { code: "STORE_UNAVAILABLE", operation, message, retryable: false } };
}

/** Constructs a fenced CanonicalMemoryStorePort, taking the storage fence (kernel flock / store-generation lock) at construction. */
export type FencedStoreOpenerV1 = (input: FencedStoreConstructionV1) => Promise<Result<CanonicalMemoryStorePort>>;

export interface CanonicalMemoryStoreFactoryOptionsV1 {
  readonly adapter_id: OpaqueRef;
  readonly adapter_version: string;
  /** Graphify wires its own sqlite/postgres openers here; the factory never re-implements the broker (§5.7). */
  readonly open: FencedStoreOpenerV1;
}

/**
 * Graphify-owned fenced-store factory (§5.7). Enforces the single-broker-instance rule: at most one
 * live broker instance per store per process. A second live holder — in-process (this registry) or
 * cross-process (the opener's kernel flock / store-generation lock) — is refused with STORE_UNAVAILABLE,
 * never queued. The in-process holder is released on graceful close(). FENCE_LOST stays terminal: the
 * factory never silently re-acquires; the host discards the instance and reconstructs a fresh one.
 */
export function createCanonicalMemoryStoreFactoryV1(
  options: CanonicalMemoryStoreFactoryOptionsV1,
): CanonicalMemoryStoreFactoryV1 {
  const liveHolders = new Set<string>();

  return {
    version: 1,
    adapter_id: options.adapter_id,
    adapter_version: options.adapter_version,
    async acquire(input: FencedStoreConstructionV1): Promise<Result<CanonicalMemoryStorePort>> {
      // in-process half of the single-broker rule: a second live holder is refused, never queued.
      if (liveHolders.has(input.store_id)) {
        return storeUnavailable("admin", "a live broker instance already exists for this store in-process (single-broker rule; not queued)");
      }
      // reserve before opening so a concurrent acquire for the same store cannot slip past the check.
      liveHolders.add(input.store_id);
      let opened: Result<CanonicalMemoryStorePort>;
      try {
        // the opener takes the storage fence at construction; a cross-process holder makes it refuse STORE_UNAVAILABLE.
        opened = await options.open(input);
      } catch {
        liveHolders.delete(input.store_id);
        return storeUnavailable("admin", "fenced store construction failed before taking the storage fence");
      }
      if (!opened.ok) {
        liveHolders.delete(input.store_id); // a failed acquisition holds no fence — free the in-process slot.
        return opened;
      }
      return { ok: true, value: withReleaseOnClose(opened.value, () => liveHolders.delete(input.store_id)) };
    },
  };
}

/** Releases the in-process holder when the store is gracefully closed; every other member passes through untouched. */
function withReleaseOnClose(store: CanonicalMemoryStorePort, release: () => void): CanonicalMemoryStorePort {
  return new Proxy(store, {
    get(target, prop, receiver) {
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
