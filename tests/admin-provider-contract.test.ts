import { describe, expect, it } from "vitest";

import { assertAdminProviderConformance, type AdminEpochReceiptV1, type AdminProviderConformanceCasesV1, type AdminProviderPort, type Digest, type Result } from "../graphify-memory/index.js";

const NOW = "2026-09-21T12:00:00.000Z";
const DEADLINE = "2026-09-21T12:04:00.000Z";
const DIGEST = ("sha256:" + "a".repeat(64)) as Digest;

const receiptAt = (operation: "bootstrap" | "rotate" | "revoke", authEpoch: number): Result<AdminEpochReceiptV1> =>
  ({ ok: true, value: { store_id: "store:s1", storage_epoch: "1", operation, authorization_epoch: String(authEpoch), credential_digest: DIGEST, issued_at: NOW, expires_at: DEADLINE, receipt_digest: DIGEST } });
const err = (denial: boolean, message: string): Result<AdminEpochReceiptV1> =>
  ({ ok: false, error: { code: "STORE_UNAVAILABLE", operation: "admin", message, retryable: false, ...(denial ? { denial: true as const } : {}) } });

interface Knobs { denialOnDenial?: boolean; denialOnFailure?: boolean; denialScenarioSucceeds?: boolean; honorsStale?: boolean; }

/**
 * A lifecycle-modelling provider whose denial-flag and rotation behaviours are tunable, so each harness check can be
 * exercised in isolation. It models bootstrap + a monotonic authorization epoch; `honorsStale` disables the epoch
 * check (the rotation-invalidation bug the stale case must catch).
 */
function provider(k: Knobs = {}): AdminProviderPort {
  let bootstrapped = false;
  let epoch = 0;
  return {
    version: 1,
    async bootstrap() { bootstrapped = true; epoch = 1; return receiptAt("bootstrap", epoch); },
    async rotate(req) {
      if (req.store_id === "store:down") return err(k.denialOnFailure ?? false, "store down"); // non-authorization failure
      if (!bootstrapped) return k.denialScenarioSucceeds ? receiptAt("rotate", 99) : err(k.denialOnDenial ?? true, "default-deny before the first valid receipt");
      if (!k.honorsStale && req.current_authorization_epoch !== String(epoch)) return err(true, "stale authorization epoch superseded by rotation");
      epoch += 1; return receiptAt("rotate", epoch);
    },
    async revoke() { return receiptAt("revoke", epoch); },
  };
}

const rot = (current_authorization_epoch: string, store_id = "store:s1") => ({ store_id, current_authorization_epoch, authorization: { credential: "c" }, deadline_at: DEADLINE });
// All three cases are required; the caller drives its provider through each scenario.
const cases: AdminProviderConformanceCasesV1 = {
  authorizationDenial: (p) => p.rotate(rot("1")),                    // an op before bootstrap = default-deny
  nonAuthorizationFailure: (p) => p.rotate(rot("1", "store:down")),  // a store failure = non-authorization
  staleReceiptAfterRotation: async (p) => {
    await p.bootstrap({ store_id: "store:s1", storage_epoch: "1", admin_credential_ref: "cred:ref", deadline_at: DEADLINE }); // R1 (epoch 1)
    await p.rotate(rot("1"));                                        // R2 (epoch 2)
    return p.rotate(rot("1"));                                       // authorized by the superseded epoch 1
  },
};

describe("assertAdminProviderConformance (§10)", () => {
  it("accepts a provider that flags a denial, does not flag a non-authorization failure, and invalidates a superseded receipt", async () => {
    expect((await assertAdminProviderConformance(provider(), cases)).ok).toBe(true);
  });

  it("rejects a provider that refuses an authorization denial WITHOUT denial:true", async () => {
    const r = await assertAdminProviderConformance(provider({ denialOnDenial: false }), cases);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain("MUST set error.denial");
  });

  it("rejects a provider that sets denial:true on a non-authorization failure", async () => {
    const r = await assertAdminProviderConformance(provider({ denialOnFailure: true }), cases);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain("MUST NOT set error.denial");
  });

  it("rejects a provider whose denial scenario unexpectedly succeeds", async () => {
    const r = await assertAdminProviderConformance(provider({ denialScenarioSucceeds: true }), cases);
    expect(r.ok).toBe(false);
  });

  it("rejects a provider that still honors a receipt superseded by rotation", async () => {
    const r = await assertAdminProviderConformance(provider({ honorsStale: true }), cases);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain("superseded by rotation");
  });
});
