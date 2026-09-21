import { describe, expect, it } from "vitest";

import { createL3Memory, lifecycleCommand, DEADLINE, NOW } from "./memory-l3-fixture.js";
import type { CanonicalMemoryStorePort, CapabilityAttestationVerifierPort, Digest, Result } from "../graphify-memory/index.js";

const ATT = ("sha256:" + "a".repeat(64)) as Digest;

/** A production (backend "sqlite") store whose readiness is attested; every other method is a reachable sentinel. */
function productionStore(): CanonicalMemoryStorePort {
  const reached = { ok: false as const, error: { code: "STORE_UNAVAILABLE" as const, operation: "admin" as const, message: "prod-stub reached", retryable: false } };
  const caps = { atomic_promotion: true, dense_cursor: true, accepted_only_lexical: true, fenced_single_writer: true, revocable_active_store: true, detached_snapshot: true, bounded_cancellation: true, backend: "sqlite" as const };
  const receipt = { ok: true as const, value: { store_id: "store:prod", backend: "sqlite" as const, storage_epoch: "7", high_water_cursor: "9", capabilities: caps, adapter_id: "adapter:graphify-sqlite", adapter_version: "1", adapter_build_digest: ATT, attestation_signature: "ed25519:x", issued_at: NOW, expires_at: DEADLINE, receipt_digest: ATT } };
  return new Proxy({} as CanonicalMemoryStorePort, {
    get(_t, prop) {
      if (prop === "readiness") return async () => receipt;
      if (prop === "version") return 1;
      if (prop === "capabilities") return caps;
      return async () => reached;
    },
  });
}

const verifier = (accept: boolean): CapabilityAttestationVerifierPort => ({
  version: 1, expected_adapter_id: "adapter:graphify-sqlite", expected_adapter_version: "1", expected_adapter_build_digest: ATT,
  verifySignature: () => accept,
});

const code = (r: Result<unknown>) => (r.ok ? "OK" : r.error.code);
const recallRequest = () => ({ query: "q", purpose_ref: "purpose:l3", authorization: { credential: "credential:l3" }, capability_policy: { minimum_channels: "lexical" as const, network: "forbid" as const }, budgets: { max_candidates: 10, max_results: 5, max_packet_bytes: 4096, deadline_at: DEADLINE } });

describe("engine gates fencing-dependent ops on capability attestation (§5.9, R1d-b)", () => {
  it("refuses every fencing-dependent op with CAPABILITY_UNAVAILABLE on a production store with no verifier", async () => {
    const { memory } = createL3Memory("accept", productionStore());
    expect(code(await memory.capture({} as never))).toBe("CAPABILITY_UNAVAILABLE");
    expect(code(await memory.requestAdmission({} as never))).toBe("CAPABILITY_UNAVAILABLE");
    expect(code(await memory.recall(recallRequest()))).toBe("CAPABILITY_UNAVAILABLE");
    expect(code(await memory.transition(lifecycleCommand("dispute", "mem_x")))).toBe("CAPABILITY_UNAVAILABLE");
    expect(code(await memory.proposeCapitalisation({} as never))).toBe("CAPABILITY_UNAVAILABLE");
  });

  it("admits a production op past the gate when a valid verifier is configured", async () => {
    const { memory } = createL3Memory("accept", productionStore(), verifier(true));
    // gate admitted => transition reaches the stubbed production store (readRecord), not the attestation refusal.
    expect(code(await memory.transition(lifecycleCommand("dispute", "mem_x")))).toBe("STORE_UNAVAILABLE");
  });

  it("still refuses when the configured verifier rejects the signature", async () => {
    const { memory } = createL3Memory("accept", productionStore(), verifier(false));
    expect(code(await memory.transition(lifecycleCommand("dispute", "mem_x")))).toBe("CAPABILITY_UNAVAILABLE");
  });
});
