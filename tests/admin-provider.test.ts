import { describe, expect, it } from "vitest";

import {
  assertAdminProviderConformance,
  type AdminEpochReceiptV1,
  type AdminProviderConformanceCasesV1,
  type AdminProviderPort,
  type Digest,
  type Result,
} from "../graphify-memory/index.js";

// §5.10/§10: the property the retired built-in local administrator once held — "a fresh store denies until an
// explicit bootstrap, and receipts issued before a rotation stop working" — is, in V2, an obligation ON THE
// INJECTED AdminProviderPort (design (d): the engine has no admin-receipt validation entry; credential/epoch
// semantics live in the provider). This test re-covers that property where the contract places it: through the
// §10 conformance harness (now including the stale-receipt-after-rotation case), in both directions.

const NOW = "2026-09-21T12:00:00.000Z";
const DEADLINE = "2026-09-21T12:04:00.000Z";
const EPOCH = "42";
const DIGEST = ("sha256:" + "a".repeat(64)) as Digest;

const receiptAt = (operation: "bootstrap" | "rotate" | "revoke", authEpoch: number): Result<AdminEpochReceiptV1> =>
  ({ ok: true, value: { store_id: "store:s1", storage_epoch: EPOCH, operation, authorization_epoch: String(authEpoch), credential_digest: DIGEST, issued_at: NOW, expires_at: DEADLINE, receipt_digest: DIGEST } });
const deny = (message: string): Result<AdminEpochReceiptV1> =>
  ({ ok: false, error: { code: "UNAUTHORIZED", operation: "admin", message, retryable: false, denial: true } });
const nonAuthFailure = (): Result<AdminEpochReceiptV1> =>
  ({ ok: false, error: { code: "STORE_UNAVAILABLE", operation: "admin", message: "store down", retryable: false } });

/** A conformant reference provider: default-deny before bootstrap, monotonic authorization epoch, rotation invalidates the prior epoch. */
function referenceProvider(): AdminProviderPort {
  let bootstrapped = false;
  let epoch = 0;
  return {
    version: 1,
    async bootstrap() { if (bootstrapped) return deny("already bootstrapped"); bootstrapped = true; epoch = 1; return receiptAt("bootstrap", epoch); },
    async rotate(req) {
      if (req.store_id === "store:down") return nonAuthFailure();                       // non-authorization failure path
      if (!bootstrapped) return deny("default-deny before the first valid receipt");    // fresh denies until bootstrap
      if (req.current_authorization_epoch !== String(epoch)) return deny("stale authorization epoch superseded by rotation");
      epoch += 1; return receiptAt("rotate", epoch);
    },
    async revoke(req) {
      if (!bootstrapped) return deny("default-deny before the first valid receipt");
      if (req.current_authorization_epoch !== String(epoch)) return deny("stale authorization epoch superseded by rotation");
      epoch += 1; return receiptAt("revoke", epoch);
    },
  };
}

/** A faulty provider that is correct on the denial flag but NEVER invalidates a superseded epoch (honors R1 after rotation). */
function staleHonoringProvider(): AdminProviderPort {
  let bootstrapped = false;
  return {
    version: 1,
    async bootstrap() { bootstrapped = true; return receiptAt("bootstrap", 1); },
    async rotate(req) {
      if (req.store_id === "store:down") return nonAuthFailure();
      if (!bootstrapped) return deny("default-deny before the first valid receipt");
      return receiptAt("rotate", 2); // BUG: never checks current_authorization_epoch — a stale R1 still succeeds
    },
    async revoke() { return receiptAt("revoke", 2); },
  };
}

const rotate = (current_authorization_epoch: string, store_id = "store:s1") =>
  ({ store_id, current_authorization_epoch, authorization: { credential: "c" }, deadline_at: DEADLINE });
const cases: AdminProviderConformanceCasesV1 = {
  authorizationDenial: (p) => p.rotate(rotate("1")),                 // an op before bootstrap is a default-deny
  nonAuthorizationFailure: (p) => p.rotate(rotate("1", "store:down")), // a store failure carries no denial flag
  staleReceiptAfterRotation: async (p) => {
    await p.bootstrap({ store_id: "store:s1", storage_epoch: EPOCH, admin_credential_ref: "cred:ref", deadline_at: DEADLINE }); // R1 (epoch 1)
    await p.rotate(rotate("1"));                                     // R2 (epoch 2) — supersedes R1
    return p.rotate(rotate("1"));                                    // authorized by the SUPERSEDED epoch 1 ⇒ MUST deny
  },
};

describe("AdminProviderPort rotation/bootstrap conformance (§5.10/§10)", () => {
  it("fresh store denies until explicit AdminProviderPort bootstrap and old receipts fail after rotation", async () => {
    // (a) fresh denies UNTIL an explicit bootstrap: an op before bootstrap is a default-deny; after bootstrap it is allowed.
    const fresh = referenceProvider();
    const beforeBootstrap = await fresh.rotate(rotate("1"));
    expect(beforeBootstrap.ok).toBe(false);
    if (!beforeBootstrap.ok) expect(beforeBootstrap.error.denial).toBe(true);
    expect((await fresh.bootstrap({ store_id: "store:s1", storage_epoch: EPOCH, admin_credential_ref: "cred:ref", deadline_at: DEADLINE })).ok).toBe(true);
    expect((await fresh.rotate(rotate("1"))).ok).toBe(true); // now allowed under the current epoch

    // (b) old receipts fail after rotation — verified through the §10 harness's stale-receipt case, BOTH directions:
    expect(await assertAdminProviderConformance(referenceProvider(), cases)).toMatchObject({ ok: true, value: { conformant: true } });

    const faultyVerdict = await assertAdminProviderConformance(staleHonoringProvider(), cases);
    expect(faultyVerdict.ok).toBe(false); // a provider that still honors the superseded epoch is NON-conformant
    if (!faultyVerdict.ok) expect(faultyVerdict.error.message).toContain("superseded by rotation");
  });

  it("refuses to certify when the mandatory staleReceiptAfterRotation case is omitted — no partial pass", async () => {
    // model a caller that omitted the now-REQUIRED case (bypassing the type); the harness must refuse, never pass,
    // so a `{ conformant: true }` can never mean "rotation was not checked".
    const twoCases = { authorizationDenial: cases.authorizationDenial, nonAuthorizationFailure: cases.nonAuthorizationFailure } as unknown as AdminProviderConformanceCasesV1;
    const verdict = await assertAdminProviderConformance(referenceProvider(), twoCases);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.error.message).toContain("staleReceiptAfterRotation");
  });
});
