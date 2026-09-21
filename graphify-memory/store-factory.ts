import { attestationReceiptDigest } from "./attestation.js";
import type {
  CanonicalMemoryStoreFactoryV1,
  CanonicalMemoryStorePort,
  CapabilityAttestationSignerV1,
  FencedStoreConstructionV1,
  MemoryOperation,
  OperationalCapabilityReceiptV1,
  Result,
} from "./contracts/index.js";

function storeUnavailable<T>(operation: MemoryOperation, message: string): Result<T> {
  return { ok: false, error: { code: "STORE_UNAVAILABLE", operation, message, retryable: false } };
}

/** Constructs a fenced CanonicalMemoryStorePort, taking the storage fence (kernel flock / store-generation lock) at construction. */
export type FencedStoreOpenerV1 = (input: FencedStoreConstructionV1) => Promise<Result<CanonicalMemoryStorePort>>;

export interface CanonicalMemoryStoreFactoryOptionsV1 {
  /**
   * Host-provided signer (§5.9). Its `identity` is the SINGLE source of the factory's adapter binding:
   * `adapter_id`/`adapter_version` are derived from it, and the acquired store's `readiness()` emits an
   * attestation bound to that identity + signed by it — so the emitted receipt and the expected identity
   * cannot diverge. graphify holds no key.
   */
  readonly attestation_signer: CapabilityAttestationSignerV1;
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
  const signer = options.attestation_signer;

  return {
    version: 1,
    adapter_id: signer.identity.adapter_id,
    adapter_version: signer.identity.adapter_version,
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
      return { ok: true, value: withAttestationAndRelease(opened.value, signer, () => liveHolders.delete(input.store_id)) };
    },
  };
}

/**
 * Wraps an acquired store so that (a) `readiness()` emits a signed attestation bound to the signer's identity —
 * §5.9 emission: strip the adapter's own digest/signature, add the 3 identity fields BEFORE digesting, compute
 * the canonical attestationReceiptDigest, then attach `attestation_signature = signer.sign(digest)`; signed on
 * EVERY call, never memoised, and the underlying opener stays ignorant of attestation — and (b) the in-process
 * holder is released on graceful `close()`. Every other member passes through untouched.
 */
function withAttestationAndRelease(store: CanonicalMemoryStorePort, signer: CapabilityAttestationSignerV1, release: () => void): CanonicalMemoryStorePort {
  return new Proxy(store, {
    get(target, prop, receiver) {
      if (prop === "readiness") {
        return async (): Promise<Result<OperationalCapabilityReceiptV1>> => {
          const base = await target.readiness();
          if (!base.ok) return base;
          const { receipt_digest: _priorDigest, attestation_signature: _priorSignature, ...rest } = base.value;
          const bound: OperationalCapabilityReceiptV1 = {
            ...rest,
            adapter_id: signer.identity.adapter_id,
            adapter_version: signer.identity.adapter_version,
            adapter_build_digest: signer.identity.adapter_build_digest,
            receipt_digest: base.value.receipt_digest,
          };
          const digest = attestationReceiptDigest(bound);
          return { ok: true, value: { ...bound, receipt_digest: digest, attestation_signature: signer.sign(digest) } };
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
