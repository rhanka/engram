import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  authorizationResourceDigest,
  createMemoryPortV2,
  policyEvidenceDigest,
  receiptDigest,
  validateAdmissionDecisionEnvelope,
  type AdmissionDecisionEnvelopeV1,
  type AdmissionPolicy,
  type MemoryEngineDependenciesV2,
} from "../graphify-memory/index.js";

const DIGEST = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const NOW = "2026-08-16T12:34:56.789Z";

const policy: AdmissionPolicy = {
  policy_id: "policy:local",
  policy_version: "1",
  async decide() { throw new Error("the engine, not the caller, invokes this"); },
};

const request = {
  record_digest: DIGEST,
  payload_digest: DIGEST,
  policy_evidence_ref: "evidence:opaque",
  policy_evidence_digest: policyEvidenceDigest("evidence:opaque"),
};

function envelope(overrides: Record<string, unknown> = {}): AdmissionDecisionEnvelopeV1 {
  const partial = {
    policy_id: policy.policy_id,
    policy_version: policy.policy_version,
    record_digest: DIGEST,
    decision: "adjudication_required" as const,
    issued_at: NOW,
    ...overrides,
  };
  return { ...partial, receipt_digest: receiptDigest("admission-decision", partial) } as AdmissionDecisionEnvelopeV1;
}

describe("admission decision envelope", () => {
  it("engine validates only the six bound policy fields and no evaluation shape is exported", () => {
    expect(validateAdmissionDecisionEnvelope(policy, request, envelope(), NOW)).toEqual({ ok: true, value: envelope() });
    expect(validateAdmissionDecisionEnvelope(policy, request, envelope({ evaluator_count: 2 }), NOW)).toMatchObject({
      ok: false,
      error: { code: "INVALID_SCHEMA" },
    });
    expect(validateAdmissionDecisionEnvelope(policy, { ...request, policy_evidence_digest: DIGEST }, envelope(), NOW)).toMatchObject({
      ok: false,
      error: { code: "INVALID_DIGEST" },
    });
    expect(validateAdmissionDecisionEnvelope(policy, request, envelope({ record_digest: `sha256:${"b".repeat(64)}` }), NOW)).toMatchObject({
      ok: false,
      error: { code: "INVALID_DIGEST" },
    });

    const contracts = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../graphify-memory/contracts/index.ts"), "utf8");
    expect(contracts).not.toMatch(/evaluator|consensus|threshold|persona|role/);
  });

  it("leaves a candidate pending when the configured policy requires adjudication", async () => {
    let pending: unknown;
    let promotions = 0;
    const authorization = {
      version: 1 as const,
      async authorize(request: { operation: "capture" | "request_admission"; resource_digest: string }) {
        const body = {
          allowed: true as const,
          decision_id: "decision:case",
          policy_version: "1",
          operation: request.operation,
          resource_digest: request.resource_digest,
          scope_ref: "scope:case-7",
          not_before: NOW,
          expires_at: "2026-08-16T12:39:56.789Z",
          revocation_epoch: "0",
          redaction: { mode: "field-allowlist" as const, allowed_fields: [], allow_derivation_lineage: false, max_packet_bytes: 4_096 },
          authentication_receipt_digest: DIGEST,
        };
        return { ok: true as const, value: { ...body, receipt_digest: receiptDigest("authorization-allowed", body) } };
      },
      async revalidate(receipt_digest: string, checked_at: string) {
        const body = { receipt_digest, checked_at, valid: true, current_revocation_epoch: "0", reason: "valid" as const };
        return { ok: true as const, value: { ...body, revalidation_receipt_digest: receiptDigest("authorization-revalidation", body, "revalidation_receipt_digest") } };
      },
      async redact() { throw new Error("unused"); },
    };
    const policy: AdmissionPolicy = {
      policy_id: "policy:local",
      policy_version: "1",
      async decide(request) {
        const body = { policy_id: "policy:local", policy_version: "1", record_digest: request.record_digest, decision: "adjudication_required" as const, issued_at: NOW };
        return { ok: true, value: { ...body, receipt_digest: receiptDigest("admission-decision", body) } };
      },
    };
    const memory = createMemoryPortV2({
      canonical_store: {
        async commitPending(input: { control: Record<string, unknown>; sealed: Record<string, unknown> }) {
          pending = { control: { ...input.control, created_cursor: "1" }, sealed: input.sealed };
          return { ok: true, value: { cursor: "1", committed_at: NOW, receipt_digest: DIGEST } };
        },
        async readPending() { return { ok: true, value: pending }; },
        async applyAdmission() { promotions += 1; throw new Error("adjudication must not promote"); },
      },
      authorization,
      admission_policy: policy,
      crypto: {
        version: 1,
        async seal(input) { return { ok: true, value: { candidate_id: input.candidate_id, envelope_ref: "envelope:case", envelope_digest: DIGEST, key_ref: "key:case", ciphertext: input.plaintext } }; },
        async open(input) { return { ok: true, value: { plaintext: input.sealed.ciphertext } }; },
        async destroy() { throw new Error("unused"); },
        async rotate() { throw new Error("unused"); },
      },
      activity_sources: [],
      clock: { now: () => NOW },
    } as unknown as MemoryEngineDependenciesV2);
    const captured = await memory.capture({
      schema_version: 2,
      idempotency_key: "idempotency-key-0001",
      payload: {
        schema_version: 2,
        scope_ref: "scope:case-7",
        purpose_ref: "purpose:case",
        valid_time: { t: 1 },
        components: [{ component_id: "component:one", kind: "context", text: "case", citation_ids: ["citation:one"] }],
        primary_component_id: "component:one",
        primary_event: { at: 1, type_ref: "event:one", citation_id: "citation:one" },
        citations: [{ citation_id: "citation:one", source_ref: "source:case", locator: { scheme: "document", value: "case#one" }, content_digest: DIGEST }],
        retention: { derivative_rule: "retain" },
        reconciliation: { family_refs: [] },
      },
      evidence: { evidence_ref: "evidence:case", evidence_digest: DIGEST, citation_ids: ["citation:one"] },
      authorization: { credential: "opaque" },
      source_order: { source_ref: "source:case", sequence: "1" },
      deadline_at: "2026-08-16T12:40:00.000Z",
      cancellation_ref: "cancel:case",
    });
    expect(captured).toMatchObject({ ok: true, value: { status: "committed_pending" } });
    if (!captured.ok || captured.value.candidate_id === undefined) return;
    await expect(memory.requestAdmission({ candidate_id: captured.value.candidate_id, authorization: { credential: "opaque" }, deadline_at: "2026-08-16T12:40:00.000Z" })).resolves.toMatchObject({
      ok: true,
      value: { status: "pending_adjudication", candidate_id: captured.value.candidate_id },
    });
    expect(promotions).toBe(0);
    expect(authorizationResourceDigest("request_admission", { candidate_id: captured.value.candidate_id })).toMatch(/^sha256:/);
  });
});
