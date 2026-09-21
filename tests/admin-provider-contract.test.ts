import { describe, expect, it } from "vitest";

import { assertAdminProviderConformance, type AdminProviderConformanceCasesV1, type AdminProviderPort, type Digest } from "../graphify-memory/index.js";

const NOW = "2026-09-21T12:00:00.000Z";
const DEADLINE = "2026-09-21T12:04:00.000Z";
const DIGEST = ("sha256:" + "a".repeat(64)) as Digest;

const denialError = (denial: boolean) => ({ ok: false as const, error: { code: "STORE_UNAVAILABLE" as const, operation: "admin" as const, message: "refused", retryable: false, ...(denial ? { denial: true as const } : {}) } });
const failureError = (denial: boolean) => ({ ok: false as const, error: { code: "STORE_UNAVAILABLE" as const, operation: "admin" as const, message: "store down", retryable: false, ...(denial ? { denial: true as const } : {}) } });

// The caller drives the provider to a denial via bootstrap and to a non-authorization failure via rotate.
const cases: AdminProviderConformanceCasesV1 = {
  authorizationDenial: (p) => p.bootstrap({ store_id: "store:s1", storage_epoch: "1", admin_credential_ref: "cred:ref", deadline_at: DEADLINE }),
  nonAuthorizationFailure: (p) => p.rotate({ store_id: "store:s1", current_authorization_epoch: "1", authorization: { credential: "c" }, deadline_at: DEADLINE }),
};

function provider(denialFlagOnDenial: boolean, denialFlagOnFailure: boolean): AdminProviderPort {
  return {
    version: 1,
    async bootstrap() { return denialError(denialFlagOnDenial); },
    async rotate() { return failureError(denialFlagOnFailure); },
    async revoke() { return failureError(false); },
  };
}

describe("assertAdminProviderConformance (§10, denial invariant)", () => {
  it("accepts a provider that flags a denial and does not flag a non-authorization failure", async () => {
    const r = await assertAdminProviderConformance(provider(true, false), cases);
    expect(r.ok).toBe(true);
  });

  it("rejects a provider that refuses an authorization denial WITHOUT denial:true", async () => {
    const r = await assertAdminProviderConformance(provider(false, false), cases);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain("MUST set error.denial");
  });

  it("rejects a provider that sets denial:true on a non-authorization failure", async () => {
    const r = await assertAdminProviderConformance(provider(true, true), cases);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain("MUST NOT set error.denial");
  });

  it("rejects a provider whose denial scenario unexpectedly succeeds", async () => {
    const succeeds: AdminProviderPort = {
      version: 1,
      async bootstrap() { return { ok: true as const, value: { store_id: "store:s1", storage_epoch: "1", operation: "bootstrap" as const, authorization_epoch: "1", credential_digest: DIGEST, issued_at: NOW, expires_at: DEADLINE, receipt_digest: DIGEST } }; },
      async rotate() { return failureError(false); },
      async revoke() { return failureError(false); },
    };
    const r = await assertAdminProviderConformance(succeeds, cases);
    expect(r.ok).toBe(false);
  });
});
