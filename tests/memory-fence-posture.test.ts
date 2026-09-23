import { describe, expect, it } from "vitest";

import {
  createMemoryPortV2,
  type CanonicalMemoryStorePort,
  type Digest,
  type MemoryEngineDependenciesV2,
  type OperationalCapabilityReceiptV1,
} from "../graphify-memory/index.js";
import { DEADLINE, NOW } from "./memory-l3-fixture.js";

// §5.9 (v5-c): the `allow_unfenced_memory_store` posture must be legible, not silent — surfaced in the capability
// descriptor and announced once at construction, so an operator can audit a fence-bypass and catch it if it is
// ever set on a production (sqlite/postgres) deployment.
const sqliteReceipt: OperationalCapabilityReceiptV1 = {
  store_id: "store:x", backend: "sqlite", storage_epoch: "7", high_water_cursor: "0",
  capabilities: { atomic_promotion: true, dense_cursor: true, accepted_only_lexical: true, fenced_single_writer: true, revocable_active_store: true, detached_snapshot: true, bounded_cancellation: true, backend: "sqlite" },
  issued_at: NOW, expires_at: DEADLINE, receipt_digest: ("sha256:" + "0".repeat(64)) as Digest,
};
// capabilities() is a reporting surface (not fencing-gated), so a bare sqlite-declaring store suffices here.
const sqliteStore = { version: 1, async readiness() { return { ok: true as const, value: sqliteReceipt }; }, async close() { return { ok: true as const, value: { closed: true as const } }; } } as unknown as CanonicalMemoryStorePort;

function engine(flag: unknown, onHook?: () => void) {
  return createMemoryPortV2({
    canonical_store: sqliteStore,
    ...(flag === undefined ? {} : { allow_unfenced_memory_store: flag }),
    ...(onHook ? { on_unfenced_memory_store_permitted: onHook } : {}),
    clock: { now: () => NOW },
  } as unknown as MemoryEngineDependenciesV2);
}

async function permitted(flag: unknown): Promise<boolean> {
  const descriptor = await engine(flag).capabilities();
  if (!descriptor.ok) throw new Error(`capabilities failed: ${descriptor.error.code}`);
  return descriptor.value.unfenced_memory_store_permitted;
}

describe("§5.9 unfenced-memory posture is legible (v5-c)", () => {
  it("reflects allow_unfenced_memory_store in the capability descriptor", async () => {
    expect(await permitted(true)).toBe(true);
    expect(await permitted(undefined)).toBe(false);
    expect(await permitted(false)).toBe(false);
    expect(await permitted("true")).toBe(false); // a string is not the strict boolean
  });

  it("announces the posture exactly once at construction when the flag is set", () => {
    let calls = 0;
    engine(true, () => { calls += 1; });
    expect(calls).toBe(1);
  });

  it("does not announce when the flag is absent, false, or the forgeable string", () => {
    let calls = 0;
    const spy = () => { calls += 1; };
    engine(undefined, spy);
    engine(false, spy);
    engine("true", spy);
    expect(calls).toBe(0);
  });

  it("mirrors the store's ephemeral-filesystem posture into the descriptor", async () => {
    const withEphemeral = (permitted: boolean): CanonicalMemoryStorePort => {
      const receipt: OperationalCapabilityReceiptV1 = { ...sqliteReceipt, capabilities: { ...sqliteReceipt.capabilities, ephemeral_filesystem_store_permitted: permitted } };
      return { version: 1, async readiness() { return { ok: true as const, value: receipt }; }, async close() { return { ok: true as const, value: { closed: true as const } }; } } as unknown as CanonicalMemoryStorePort;
    };
    const descriptorFor = async (permitted: boolean) => {
      const d = await createMemoryPortV2({ canonical_store: withEphemeral(permitted), clock: { now: () => NOW } } as unknown as MemoryEngineDependenciesV2).capabilities();
      if (!d.ok) throw new Error(`capabilities failed: ${d.error.code}`);
      return d.value.ephemeral_filesystem_store_permitted;
    };
    expect(await descriptorFor(true)).toBe(true);
    expect(await descriptorFor(false)).toBe(false);
  });
});
