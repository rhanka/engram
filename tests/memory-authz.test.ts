import { describe, expect, it } from "vitest";

import {
  applyPortOwnedRedaction,
  authorizationResourceDigest,
  authorizeOperation,
  createMemoryPortV2,
  receiptDigest,
  validateAuthorizationAllowed,
  type AuthorizationAllowedV1,
  type AuthorizationPort,
  type MemoryEngineDependenciesV2,
} from "../graphify-memory/index.js";

const DIGEST = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const NOW = "2026-08-16T12:34:56.789Z";
const LATER = "2026-08-16T12:34:57.000Z";

function allowed(overrides: Partial<AuthorizationAllowedV1> = {}): AuthorizationAllowedV1 {
  const partial = {
    allowed: true as const,
    decision_id: "decision:local",
    policy_version: "1",
    operation: "capture" as const,
    resource_digest: authorizationResourceDigest("capture", { scope_ref: "scope:case-7" }),
    scope_ref: "scope:case-7",
    not_before: NOW,
    expires_at: "2026-08-16T12:39:56.789Z",
    revocation_epoch: "0",
    redaction: {
      mode: "field-allowlist" as const,
      allowed_fields: ["/components", "/scope_ref"],
      allow_derivation_lineage: false,
      max_packet_bytes: 4_096,
    },
    authentication_receipt_digest: DIGEST,
    ...overrides,
  };
  return { ...partial, receipt_digest: receiptDigest("authorization-allowed", partial) };
}

const captureRequest = {
  operation: "capture" as const,
  resource: { scope_ref: "scope:case-7" },
  resource_digest: authorizationResourceDigest("capture", { scope_ref: "scope:case-7" }),
  context: { credential: "opaque-credential" },
  issued_at: NOW,
  deadline_at: "2026-08-16T12:40:00.000Z",
};

function portWith(result: AuthorizationAllowedV1, revalidation: { valid: boolean; reason: "valid" | "expired" | "revoked" | "unknown"; current_revocation_epoch: string }): AuthorizationPort {
  return {
    version: 1,
    async authorize() { return { ok: true, value: result }; },
    async revalidate(receipt_digest, checked_at) {
      const packet = {
        receipt_digest,
        checked_at,
        valid: revalidation.valid,
        current_revocation_epoch: revalidation.current_revocation_epoch,
        reason: revalidation.reason,
      };
      return {
        ok: true,
        value: {
          ...packet,
          revalidation_receipt_digest: receiptDigest("authorization-revalidation", packet, "revalidation_receipt_digest"),
        },
      };
    },
    async redact() { return { ok: false, error: { code: "CAPABILITY_UNAVAILABLE", operation: "recall_current", message: "unused", retryable: false } }; },
  };
}

describe("authorization binding", () => {
  it("deny expired revoked mismatched or caller-supplied authorization and apply port-owned field omission", async () => {
    expect(validateAuthorizationAllowed({ request: captureRequest, expected_scope_ref: "scope:case-7", checked_at: LATER }, allowed({ expires_at: NOW }))).toMatchObject({
      ok: false,
      error: { code: "AUTHORIZATION_EXPIRED" },
    });
    expect(validateAuthorizationAllowed({ request: captureRequest, expected_scope_ref: "scope:case-7", checked_at: LATER }, allowed({ operation: "recall_current" }))).toMatchObject({
      ok: false,
      error: { code: "UNAUTHORIZED" },
    });
    expect(validateAuthorizationAllowed({ request: captureRequest, expected_scope_ref: "scope:case-7", checked_at: LATER }, allowed({ resource_digest: DIGEST }))).toMatchObject({
      ok: false,
      error: { code: "UNAUTHORIZED" },
    });
    expect(validateAuthorizationAllowed({ request: captureRequest, expected_scope_ref: "scope:case-7", checked_at: LATER }, allowed({ scope_ref: "scope:other" }))).toMatchObject({
      ok: false,
      error: { code: "UNAUTHORIZED" },
    });

    const revoked = await authorizeOperation(portWith(allowed(), { valid: false, reason: "revoked", current_revocation_epoch: "1" }), captureRequest, "scope:case-7", LATER);
    expect(revoked).toMatchObject({ ok: false, error: { code: "AUTHORIZATION_REVOKED" } });

    const redacted = applyPortOwnedRedaction({
      schema_version: 2,
      scope_ref: "scope:case-7",
      purpose_ref: "purpose:case",
      valid_time: { t: 1 },
      components: [],
      primary_component_id: "component:one",
      primary_event: { at: 1, type_ref: "event:one", citation_id: "citation:one" },
      citations: [],
      retention: { derivative_rule: "retain" },
      reconciliation: { family_refs: [] },
      derivation: { source_record_ids: ["mem_a"], transform_ref: "transform:one", transform_receipt_digest: DIGEST },
    }, allowed().redaction);
    expect(redacted).toEqual({ ok: true, value: { components: [], scope_ref: "scope:case-7" } });

    let commits = 0;
    const memory = createMemoryPortV2({
      canonical_store: { async commitPending() { commits += 1; return { ok: false, error: { code: "STORE_UNAVAILABLE", operation: "capture", message: "unused", retryable: false } }; } },
      clock: { now: () => NOW },
    } as unknown as MemoryEngineDependenciesV2);
    const callerSupplied = await memory.capture({
      schema_version: 2,
      idempotency_key: "idempotency-key-0001",
      payload: {} as never,
      evidence: {} as never,
      authorization: { credential: "opaque-credential" },
      source_order: { source_ref: "source:case", sequence: "1" },
      deadline_at: "2026-08-16T12:40:00.000Z",
      cancellation_ref: "cancel:case",
      authorization_result: allowed(),
    } as never);
    expect(callerSupplied).toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA" } });
    expect(commits).toBe(0);
  });
});
