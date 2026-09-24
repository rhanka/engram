import { describe, expect, it } from "vitest";

import {
  createCanonicalMemoryStoreFactoryV1,
  isFencedFactoryStoreV1,
  ENGRAM_MEMORY_ADAPTER_IDENTITY,
  type CanonicalMemoryStorePort,
  type FencedStoreConstructionV1,
  type Result,
} from "../engram-memory/index.js";
// §5.9 v5-b: the opener stamps the store as fence-holding only after taking a real kernel fence; the factory then
// PROPAGATES that mark to the wrapper it returns. This fake opener models a real one that took the fence.
import { markFencedStoreV1 } from "../engram-memory/store-factory.js";

const construction = (store_id: string): FencedStoreConstructionV1 => ({ store_id, backend: "sqlite", deadline_at: "2026-09-20T12:05:00.000Z" });

const okStore = (onClose?: () => void): Result<CanonicalMemoryStorePort> => {
  const store = { version: 1, async close() { onClose?.(); return { ok: true as const, value: { closed: true as const } }; } } as unknown as CanonicalMemoryStorePort;
  markFencedStoreV1(store); // the opener took the fence; the factory propagates this mark to its wrapper
  return { ok: true, value: store };
};

function makeFactory() {
  const openCalls: FencedStoreConstructionV1[] = [];
  const closes: string[] = [];
  let open: (input: FencedStoreConstructionV1) => Promise<Result<CanonicalMemoryStorePort>> = async (input) => okStore(() => closes.push(input.store_id));
  const factory = createCanonicalMemoryStoreFactoryV1({
    open: async (input) => { openCalls.push(input); return open(input); },
  });
  return { factory, openCalls, closes, setOpen: (o: typeof open) => { open = o; } };
}

describe("CanonicalMemoryStoreFactoryV1.acquire (§5.7)", () => {
  it("takes the fence at construction, returns a live fenced store, and stamps it with this module's provenance mark", async () => {
    const { factory, openCalls } = makeFactory();
    const acquired = await factory.acquire(construction("store:a"));
    expect(acquired.ok).toBe(true);
    if (acquired.ok) expect(isFencedFactoryStoreV1(acquired.value)).toBe(true); // §5.9 in-process mark
    expect(openCalls).toHaveLength(1);
    expect(factory.version).toBe(1);
    expect(factory.adapter_id).toBe(ENGRAM_MEMORY_ADAPTER_IDENTITY.adapter_id); // derived from the module's compiled identity
  });

  it("refuses a second live in-process holder with STORE_UNAVAILABLE, not queued (opener not re-invoked)", async () => {
    const { factory, openCalls } = makeFactory();
    expect((await factory.acquire(construction("store:a"))).ok).toBe(true);
    const second = await factory.acquire(construction("store:a"));
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe("STORE_UNAVAILABLE");
    expect(openCalls).toHaveLength(1);
  });

  it("releases the in-process holder on close, allowing re-acquire", async () => {
    const { factory, closes } = makeFactory();
    const first = await factory.acquire(construction("store:a"));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(await first.value.close()).toEqual({ ok: true, value: { closed: true } });
    expect(closes).toEqual(["store:a"]);
    expect((await factory.acquire(construction("store:a"))).ok).toBe(true);
  });

  it("tracks holders per store — distinct stores acquire independently", async () => {
    const { factory } = makeFactory();
    expect((await factory.acquire(construction("store:a"))).ok).toBe(true);
    expect((await factory.acquire(construction("store:b"))).ok).toBe(true);
    expect((await factory.acquire(construction("store:a"))).ok).toBe(false);
  });

  it("surfaces an opener STORE_UNAVAILABLE (cross-process holder) and leaves no in-process holder", async () => {
    const { factory, setOpen, openCalls } = makeFactory();
    setOpen(async () => ({ ok: false, error: { code: "STORE_UNAVAILABLE", operation: "admin", message: "cross-process flock held", retryable: false } }));
    const first = await factory.acquire(construction("store:a"));
    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.error.code).toBe("STORE_UNAVAILABLE");
    await factory.acquire(construction("store:a"));
    expect(openCalls).toHaveLength(2);
  });

  it("maps an opener throw to STORE_UNAVAILABLE and leaks no holder", async () => {
    const { factory, setOpen } = makeFactory();
    setOpen(async () => { throw new Error("driver missing"); });
    const r = await factory.acquire(construction("store:a"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("STORE_UNAVAILABLE");
    setOpen(async () => okStore());
    expect((await factory.acquire(construction("store:a"))).ok).toBe(true);
  });
});
