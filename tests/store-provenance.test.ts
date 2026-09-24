import { describe, expect, it } from "vitest";

import {
  createCanonicalMemoryStoreFactoryV1,
  createInMemoryCanonicalMemoryStoreV1,
  isFencedFactoryStoreV1,
  verifyStoreProvenance,
  ENGRAM_MEMORY_ADAPTER_IDENTITY,
  type CanonicalMemoryStorePort,
  type Digest,
  type FencedStoreConstructionV1,
  type OperationalCapabilityReceiptV1,
  type Result,
} from "../engram-memory/index.js";
// Internal fence mark (barrel does not re-export it). A test may model the sqlite/postgres opener, which stamps
// the raw store only after a real kernel fence; the factory then propagates the mark to the wrapper it returns.
import { markFencedStoreV1 } from "../engram-memory/store-factory.js";

const NOW = "2026-09-21T12:00:00.000Z";
const DEADLINE = "2026-09-21T12:05:00.000Z";
const caps = (backend: "memory" | "sqlite") => ({ atomic_promotion: true as const, dense_cursor: true as const, accepted_only_lexical: true as const, fenced_single_writer: backend !== "memory", revocable_active_store: backend !== "memory", detached_snapshot: backend !== "memory", bounded_cancellation: backend !== "memory", backend });
const code = (r: Result<unknown>) => (r.ok ? "OK" : r.error.code);
// The two host postures. PROD is fail-closed; EMBEDDED is a non-production host opting into an unfenced in-memory fake.
const PROD = { allowUnfencedMemoryStore: false } as const;
const EMBEDDED = { allowUnfencedMemoryStore: true } as const;

/** A bare store built by NO engram-memory factory: readiness returns a receipt with the given backend + optional declared identity. */
function bareStore(backend: "memory" | "sqlite", declared?: { adapter_id?: string; adapter_version?: string; adapter_build_digest?: Digest }): CanonicalMemoryStorePort {
  const value: OperationalCapabilityReceiptV1 = { store_id: "store:x", backend, storage_epoch: backend === "memory" ? "0" : "7", high_water_cursor: "0", capabilities: caps(backend), ...declared, issued_at: NOW, expires_at: DEADLINE, receipt_digest: ("sha256:" + "0".repeat(64)) as Digest };
  return { version: 1, async readiness() { return { ok: true as const, value }; }, async close() { return { ok: true as const, value: { closed: true as const } }; } } as unknown as CanonicalMemoryStorePort;
}
const construction: FencedStoreConstructionV1 = { store_id: "store:prod", backend: "sqlite", deadline_at: DEADLINE };

/** A factory acquisition whose opener NEVER took a real fence (it did not stamp): the §5.9 threat-3 store. */
async function factoryStore(): Promise<CanonicalMemoryStorePort> {
  const factory = createCanonicalMemoryStoreFactoryV1({ open: async () => ({ ok: true, value: bareStore("sqlite") }) });
  const acquired = await factory.acquire(construction);
  if (!acquired.ok) throw new Error("acquire failed");
  return acquired.value;
}

/** Models the real sqlite/postgres opener: it took a live kernel fence and stamped the raw store, which the factory then propagates to its wrapper. */
async function fencedFactoryStore(): Promise<CanonicalMemoryStorePort> {
  const factory = createCanonicalMemoryStoreFactoryV1({ open: async () => { const raw = bareStore("sqlite"); markFencedStoreV1(raw); return { ok: true as const, value: raw }; } });
  const acquired = await factory.acquire({ ...construction, store_id: "store:fenced" });
  if (!acquired.ok) throw new Error("acquire failed");
  return acquired.value;
}
const readinessOf = async (store: CanonicalMemoryStorePort): Promise<OperationalCapabilityReceiptV1> => {
  const r = await store.readiness();
  if (!r.ok) throw new Error("readiness failed");
  return r.value;
};

describe("store provenance admission (§5.9, in-process mark)", () => {
  it("admits a factory acquisition whose opener took a real fence and stamped it — propagated to the wrapper the engine holds", async () => {
    const store = await fencedFactoryStore();
    expect(isFencedFactoryStoreV1(store)).toBe(true); // the opener's mark propagated to the returned proxy
    expect(code(verifyStoreProvenance(store, await readinessOf(store), PROD, "capture"))).toBe("OK");
  });

  it("admits on the fence mark alone, NOT on the self-declared fenced_single_writer boolean (retired as an F1-family basis)", async () => {
    const store = await fencedFactoryStore();
    const receipt = await readinessOf(store);
    const claimsUnfenced: OperationalCapabilityReceiptV1 = { ...receipt, capabilities: { ...receipt.capabilities, fenced_single_writer: false } };
    expect(code(verifyStoreProvenance(store, claimsUnfenced, PROD, "capture"))).toBe("OK");
  });

  it("refuses a factory acquisition whose opener never took a real fence — the wrapper stays unmarked (§5.9 threat-3 store rejected)", async () => {
    const store = await factoryStore();
    expect(isFencedFactoryStoreV1(store)).toBe(false); // nothing stamped the raw store, so nothing propagated
    expect(code(verifyStoreProvenance(store, await readinessOf(store), PROD, "capture"))).toBe("CAPABILITY_UNAVAILABLE");
  });

  it("refuses a production store NOT built by this factory — even one self-declaring the correct identity (the mark, not a copyable string, is the proof)", async () => {
    const store = bareStore("sqlite", ENGRAM_MEMORY_ADAPTER_IDENTITY);
    expect(isFencedFactoryStoreV1(store)).toBe(false);
    const refused = verifyStoreProvenance(store, await readinessOf(store), PROD, "capture");
    expect(code(refused)).toBe("CAPABILITY_UNAVAILABLE");
    if (!refused.ok) expect(refused.error.message).toContain("not built by this engram-memory module instance");
  });

  // §5.9 F1: the in-memory exemption is (opt-in flag) AND (module membership) — never the flag alone, never the receipt's backend string.
  it("(1) admits an in-memory store built by this module when the host opts in", async () => {
    const store = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => NOW } });
    expect(code(verifyStoreProvenance(store, await readinessOf(store), EMBEDDED, "capture"))).toBe("OK");
  });

  it("(2) refuses a bare store the module never built even with backend \"memory\" and the flag up (flag alone is not the exemption)", async () => {
    const store = bareStore("memory");
    expect(isFencedFactoryStoreV1(store)).toBe(false);
    expect(code(verifyStoreProvenance(store, await readinessOf(store), EMBEDDED, "capture"))).toBe("CAPABILITY_UNAVAILABLE");
  });

  it("(3) refuses an in-memory store built by this module when the host did NOT opt in (production fail-closed; membership alone is not the exemption)", async () => {
    const store = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => NOW } });
    expect(code(verifyStoreProvenance(store, await readinessOf(store), PROD, "capture"))).toBe("CAPABILITY_UNAVAILABLE");
  });

  it("(4) decides without consulting receipt.backend: a module in-memory store is admitted even when its receipt claims backend \"sqlite\"; a bare store is refused even when it claims backend \"memory\"", async () => {
    const embedded = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => NOW } });
    const claimsSqlite: OperationalCapabilityReceiptV1 = { ...(await readinessOf(embedded)), backend: "sqlite" };
    expect(code(verifyStoreProvenance(embedded, claimsSqlite, EMBEDDED, "capture"))).toBe("OK");

    const bare = bareStore("memory");
    expect(code(verifyStoreProvenance(bare, await readinessOf(bare), EMBEDDED, "capture"))).toBe("CAPABILITY_UNAVAILABLE");
  });
});
