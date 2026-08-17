import { describe, expect, it } from "vitest";

import {
  evaluateTrustEligibility,
  validateCandidatePayload,
} from "../graphify-memory/index.js";

const DIGEST = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const AT = "2026-08-16T12:34:56.789Z";

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 2,
    scope_ref: "scope:case-7",
    purpose_ref: "purpose:case",
    valid_time: { t: 1_755_350_096_789 },
    components: [{ component_id: "component:context", kind: "context", text: "Observed case context.", citation_ids: ["citation:source"] }],
    primary_component_id: "component:context",
    primary_event: { at: 1_755_350_096_789, type_ref: "event:observed", citation_id: "citation:source" },
    citations: [{
      citation_id: "citation:source",
      source_ref: "source:case",
      locator: { scheme: "document", value: "case-7#context" },
      content_digest: DIGEST,
    }],
    retention: { derivative_rule: "retain" },
    reconciliation: { family_refs: [] },
    ...overrides,
  };
}

const assertedBinding = {
  class: "asserted",
  evidence_digest: DIGEST,
  verifier_id: "engine:asserted",
  verifier_version: "1",
  issued_at: AT,
  revocation_epoch: "0",
  receipt_digest: DIGEST,
} as const;

describe("trust foundation", () => {
  it("caller cannot self-label earned or signed and revoked receipt is ineligible", () => {
    for (const trust of ["earned", "signed"]) {
      const attempt = validateCandidatePayload(candidate({ trust }), { scope_ref: "scope:case-7" });
      expect(attempt).toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA" } });
    }

    const revoked = evaluateTrustEligibility(assertedBinding, {
      binding_receipt_digest: DIGEST,
      checked_at: AT,
      valid: false,
      current_revocation_epoch: "1",
      reason: "revoked",
      revalidation_receipt_digest: DIGEST,
    });
    expect(revoked).toMatchObject({ ok: false, error: { code: "AUTHORIZATION_REVOKED" } });

    const valid = evaluateTrustEligibility(assertedBinding, {
      binding_receipt_digest: DIGEST,
      checked_at: AT,
      valid: true,
      current_revocation_epoch: "0",
      reason: "valid",
      revalidation_receipt_digest: DIGEST,
    });
    expect(valid).toEqual({ ok: true, value: { eligible: true } });
  });
});
