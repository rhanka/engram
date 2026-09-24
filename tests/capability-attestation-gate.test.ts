import { describe, expect, it } from "vitest";

import { createL3Memory, lifecycleCommand, DEADLINE, NOW } from "./memory-l3-fixture.js";
import {
  createCanonicalMemoryStoreFactoryV1,
  type CanonicalMemoryStorePort,
  type Digest,
  type FencedStoreConstructionV1,
  type OperationalCapabilityReceiptV1,
  type Result,
} from "../engram-memory/index.js";
// Internal fence mark (barrel does not re-export it) — a test models the opener stamping a store after a real fence.
import { markFencedStoreV1 } from "../engram-memory/store-factory.js";

const caps = { atomic_promotion: true as const, dense_cursor: true as const, accepted_only_lexical: true as const, fenced_single_writer: true, revocable_active_store: true, detached_snapshot: true, bounded_cancellation: true, backend: "sqlite" as const };
const reached = { ok: false as const, error: { code: "STORE_UNAVAILABLE" as const, operation: "admin" as const, message: "prod-stub reached", retryable: false } };
const receipt: OperationalCapabilityReceiptV1 = { store_id: "store:prod", backend: "sqlite", storage_epoch: "7", high_water_cursor: "9", capabilities: caps, issued_at: NOW, expires_at: DEADLINE, receipt_digest: ("sha256:" + "0".repeat(64)) as Digest };

/** A production-backend store; readiness returns a bare sqlite receipt (no identity), every other method is a sentinel. */
function bareProductionStore(): CanonicalMemoryStorePort {
  return new Proxy({} as CanonicalMemoryStorePort, {
    get(_t, prop) {
      if (prop === "then") return undefined; // never a thenable — a catch-all get-trap would make awaiting the store hang
      if (prop === "readiness") return async () => ({ ok: true as const, value: receipt });
      if (prop === "version") return 1;
      if (prop === "capabilities") return caps;
      return async () => reached;
    },
  });
}
const construction: FencedStoreConstructionV1 = { store_id: "store:prod", backend: "sqlite", deadline_at: DEADLINE };
/** Factory acquisition over an opener that never took a real fence (no stamp): the wrapper stays unmarked. */
async function factoryProductionStore(): Promise<CanonicalMemoryStorePort> {
  const factory = createCanonicalMemoryStoreFactoryV1({ open: async () => ({ ok: true, value: bareProductionStore() }) });
  const acquired = await factory.acquire(construction);
  if (!acquired.ok) throw new Error("acquire failed");
  return acquired.value;
}

/** Models the real opener: it took a live fence and stamped the raw store; the factory propagates the mark. */
async function fencedFactoryProductionStore(): Promise<CanonicalMemoryStorePort> {
  const factory = createCanonicalMemoryStoreFactoryV1({ open: async () => { const raw = bareProductionStore(); markFencedStoreV1(raw); return { ok: true as const, value: raw }; } });
  const acquired = await factory.acquire({ ...construction, store_id: "store:fenced" });
  if (!acquired.ok) throw new Error("acquire failed");
  return acquired.value;
}
const code = (r: Result<unknown>) => (r.ok ? "OK" : r.error.code);
const recallRequest = () => ({ query: "q", purpose_ref: "purpose:l3", authorization: { credential: "credential:l3" }, capability_policy: { minimum_channels: "lexical" as const, network: "forbid" as const }, budgets: { max_candidates: 10, max_results: 5, max_packet_bytes: 4096, deadline_at: DEADLINE } });

describe("engine gates fencing-dependent ops on store provenance (§5.9, R1d-b + mark)", () => {
  it("refuses every fencing-dependent op with CAPABILITY_UNAVAILABLE on a production store not built by this factory", async () => {
    const { memory } = createL3Memory("accept", bareProductionStore());
    expect(code(await memory.capture({} as never))).toBe("CAPABILITY_UNAVAILABLE");
    expect(code(await memory.requestAdmission({} as never))).toBe("CAPABILITY_UNAVAILABLE");
    expect(code(await memory.recall(recallRequest()))).toBe("CAPABILITY_UNAVAILABLE");
    expect(code(await memory.transition(lifecycleCommand("dispute", "mem_x")))).toBe("CAPABILITY_UNAVAILABLE");
    expect(code(await memory.proposeCapitalisation({} as never))).toBe("CAPABILITY_UNAVAILABLE");
  });

  it("refuses a factory acquisition whose opener never took a real fence — factory acquisition alone is not a fence (§5.9 threat-3)", async () => {
    const { memory } = createL3Memory("accept", await factoryProductionStore());
    // the wrapper is unmarked (nothing stamped the opener's store), so the gate refuses before reaching the store.
    expect(code(await memory.transition(lifecycleCommand("dispute", "mem_x")))).toBe("CAPABILITY_UNAVAILABLE");
  });

  it("admits a production op past the gate ONLY when the opener took (and stamped) a real fence", async () => {
    const { memory } = createL3Memory("accept", await fencedFactoryProductionStore());
    // gate admitted (fence mark propagated) => transition reaches the stubbed production store, not the refusal.
    expect(code(await memory.transition(lifecycleCommand("dispute", "mem_x")))).toBe("STORE_UNAVAILABLE");
  });
});
