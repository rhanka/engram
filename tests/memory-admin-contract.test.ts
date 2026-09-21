import { describe, expect, it } from "vitest";

import { validateAdminOperationRequest } from "../graphify-memory/index.js";

const EPOCH = "42";
const DEADLINE = "2026-09-20T12:00:00.000Z";
const DIGEST = "sha256:" + "a".repeat(64);
const AUTHZ = { credential_ref: "cred:ref", context_ref: "ctx:ref" };

const bootstrap = (o: Record<string, unknown> = {}) => ({ operation: "bootstrap", bootstrap: { store_id: "store:s1", storage_epoch: EPOCH, admin_credential_ref: "cred:ref", deadline_at: DEADLINE, ...o } });
const rotate = () => ({ operation: "rotate", rotate: { store_id: "store:s1", current_authorization_epoch: EPOCH, authorization: AUTHZ, deadline_at: DEADLINE } });
const revoke = () => ({ operation: "revoke", revoke: { store_id: "store:s1", current_authorization_epoch: EPOCH, credential_digest: DIGEST, authorization: AUTHZ, deadline_at: DEADLINE } });

describe("AdminOperationRequestV1 contract shape (§5.10)", () => {
  it("accepts a well-formed bootstrap, rotate, and revoke request", () => {
    for (const req of [bootstrap(), rotate(), revoke()]) {
      const r = validateAdminOperationRequest(req);
      expect(r.ok).toBe(true);
    }
  });

  it("rejects a missing, unknown, or sub-request-less operation discriminant with INVALID_SCHEMA", () => {
    for (const bad of [{}, { operation: "nope" }, { operation: "bootstrap" }]) {
      const r = validateAdminOperationRequest(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("INVALID_SCHEMA");
    }
  });

  it("rejects a bootstrap missing required fields", () => {
    const r = validateAdminOperationRequest({ operation: "bootstrap", bootstrap: { store_id: "store:s1" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("INVALID_SCHEMA");
  });

  it("rejects a sub-request mismatched to the discriminant", () => {
    const r = validateAdminOperationRequest({ operation: "rotate", bootstrap: bootstrap().bootstrap });
    expect(r.ok).toBe(false);
  });
});
