import { describe, expect, it } from "vitest";

import {
  createCanonicalMemoryStoreFactoryV1,
  isFencedFactoryStoreV1,
  verifyStoreProvenance,
  GRAPHIFY_MEMORY_ADAPTER_IDENTITY,
  type CanonicalMemoryStorePort,
  type Digest,
  type FencedStoreConstructionV1,
  type OperationalCapabilityReceiptV1,
  type Result,
} from "../graphify-memory/index.js";

const NOW = "2026-09-21T12:00:00.000Z";
const DEADLINE = "2026-09-21T12:05:00.000Z";
const caps = (backend: "memory" | "sqlite") => ({ atomic_promotion: true as const, dense_cursor: true as const, accepted_only_lexical: true as const, fenced_single_writer: backend !== "memory", revocable_active_store: backend !== "memory", detached_snapshot: backend !== "memory", bounded_cancellation: backend !== "memory", backend });
const code = (r: Result<unknown>) => (r.ok ? "OK" : r.error.code);

/** A bare store NOT built by the factory: readiness returns a receipt with the given backend + optional declared identity. */
function bareStore(backend: "memory" | "sqlite", declared?: { adapter_id?: string; adapter_version?: string; adapter_build_digest?: Digest }): CanonicalMemoryStorePort {
  const value: OperationalCapabilityReceiptV1 = { store_id: "store:x", backend, storage_epoch: backend === "memory" ? "0" : "7", high_water_cursor: "0", capabilities: caps(backend), ...declared, issued_at: NOW, expires_at: DEADLINE, receipt_digest: ("sha256:" + "0".repeat(64)) as Digest };
  return { version: 1, async readiness() { return { ok: true as const, value }; }, async close() { return { ok: true as const, value: { closed: true as const } }; } } as unknown as CanonicalMemoryStorePort;
}
const construction: FencedStoreConstructionV1 = { store_id: "store:prod", backend: "sqlite", deadline_at: DEADLINE };

async function factoryStore(): Promise<CanonicalMemoryStorePort> {
  const factory = createCanonicalMemoryStoreFactoryV1({ open: async () => ({ ok: true, value: bareStore("sqlite") }) });
  const acquired = await factory.acquire(construction);
  if (!acquired.ok) throw new Error("acquire failed");
  return acquired.value;
}
const readinessOf = async (store: CanonicalMemoryStorePort): Promise<OperationalCapabilityReceiptV1> => {
  const r = await store.readiness();
  if (!r.ok) throw new Error("readiness failed");
  return r.value;
};

describe("store provenance admission (§5.9, in-process mark)", () => {
  it("admits a production store built by THIS module's fenced factory (the sense whose absence bricked production)", async () => {
    const store = await factoryStore();
    expect(isFencedFactoryStoreV1(store)).toBe(true);
    const receipt = await readinessOf(store);
    expect(receipt.adapter_id).toBe(GRAPHIFY_MEMORY_ADAPTER_IDENTITY.adapter_id); // stamped by the factory
    expect(code(verifyStoreProvenance(store, receipt, "capture"))).toBe("OK");
  });

  it("refuses a production store NOT built by this factory — even one self-declaring the correct identity (the mark, not a copyable string, is the proof)", async () => {
    const store = bareStore("sqlite", GRAPHIFY_MEMORY_ADAPTER_IDENTITY);
    expect(isFencedFactoryStoreV1(store)).toBe(false);
    const refused = verifyStoreProvenance(store, await readinessOf(store), "capture");
    expect(code(refused)).toBe("CAPABILITY_UNAVAILABLE");
    if (!refused.ok) expect(refused.error.message).toContain("not built by this graphify-memory module instance");
  });

  it("admits a non-production (memory) store with no mark and no declared identity", async () => {
    const store = bareStore("memory");
    expect(code(verifyStoreProvenance(store, await readinessOf(store), "capture"))).toBe("OK");
  });
});
