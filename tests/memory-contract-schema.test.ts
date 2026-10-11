import { describe, expect, it } from "vitest";

import {
  knowledgePayloadDigest,
  memoryRecordDigest,
  recordIdFromDigest,
  validateCandidatePayload,
  validateMemoryRecord,
} from "../engram-memory/index.js";
import { reconciliationProposalIdV1 } from "../engram-memory/assertion-family-registry.js";
import type { ReconciliationOutcomeV1, ReconciliationProposalV1 } from "../engram-memory/contracts/index.js";
import { receiptDigest } from "../engram-memory/digests.js";
import {
  validateReconciliationCommandBinding,
  validateReconciliationOutcome,
  validateReconciliationRequest,
} from "../engram-memory/validation.js";

const DIGEST = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SCOPE = "scope:case-7";
const RECORDED_AT = "2026-08-16T12:34:56.789Z";

function payload(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 2,
    scope_ref: SCOPE,
    purpose_ref: "purpose:case",
    valid_time: { t: 1_755_350_096_789, t_end: 1_755_350_096_789 },
    components: [{
      component_id: "component:decision",
      kind: "decision",
      text: "Applied the documented correction.",
      citation_ids: ["citation:source"],
    }],
    primary_component_id: "component:decision",
    primary_event: {
      at: 1_755_350_096_789,
      type_ref: "event:correction-applied",
      citation_id: "citation:source",
    },
    citations: [{
      citation_id: "citation:source",
      source_ref: "source:case",
      locator: { scheme: "document", value: "case-7#correction" },
      content_digest: DIGEST,
      observed_at: RECORDED_AT,
    }],
    retention: { derivative_rule: "make-ineligible" },
    reconciliation: { family_refs: [] },
    ...overrides,
  };
}

function record() {
  const candidate = payload();
  const payload_digest = knowledgePayloadDigest(candidate);
  const incomplete = {
    ...candidate,
    record_id: "mem_placeholder",
    payload_digest,
    record_digest: DIGEST,
    recorded_at: RECORDED_AT,
    recorded_cursor: "7",
    authorization_receipt_digest: DIGEST,
    trust: {
      class: "asserted",
      evidence_digest: DIGEST,
      verifier_id: "engine:asserted",
      verifier_version: "1",
      issued_at: RECORDED_AT,
      revocation_epoch: "0",
      receipt_digest: DIGEST,
    },
  };
  const record_digest = memoryRecordDigest(incomplete);
  return {
    ...incomplete,
    record_id: recordIdFromDigest(record_digest),
    record_digest,
  };
}

describe("MemoryRecordV2 contract", () => {
  it("exact schema rejects every additional property and binds primary component event citation payload and record digests", () => {
    const candidate = payload();
    const validatedCandidate = validateCandidatePayload(candidate, { scope_ref: SCOPE });
    expect(validatedCandidate.ok).toBe(true);
    if (!validatedCandidate.ok) return;

    expect(validatedCandidate.value.payload_digest).toBe(
      "sha256:df5abcbf1d1091794c1f37efcd89e5f7bd6b91afa631e29f084178d35c55e913",
    );
    expect(knowledgePayloadDigest({ ...candidate, components: [...candidate.components] })).toBe(
      validatedCandidate.value.payload_digest,
    );

    const candidateWithWriterField = validateCandidatePayload(
      { ...candidate, recorded_at: RECORDED_AT },
      { scope_ref: SCOPE },
    );
    expect(candidateWithWriterField).toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA" } });

    const wrongAnchorCitation = validateCandidatePayload(
      payload({ primary_event: { at: 1_755_350_096_789, type_ref: "event:correction-applied", citation_id: "citation:other" } }),
      { scope_ref: SCOPE },
    );
    expect(wrongAnchorCitation).toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA" } });

    const wrongScope = validateCandidatePayload(candidate, { scope_ref: "scope:other" });
    expect(wrongScope).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    const wildcardScope = validateCandidatePayload(payload({ scope_ref: "scope:*" }), { scope_ref: "scope:*" });
    expect(wildcardScope).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });

    const fullRecord = record();
    const validatedRecord = validateMemoryRecord(fullRecord, { scope_ref: SCOPE });
    expect(validatedRecord).toMatchObject({
      ok: true,
      value: { payload_digest: validatedCandidate.value.payload_digest, record_digest: fullRecord.record_digest },
    });
    expect(fullRecord.record_digest).not.toBe(fullRecord.payload_digest);
    expect(memoryRecordDigest({ ...fullRecord, recorded_at: "2026-08-16T12:34:56.790Z" })).not.toBe(
      fullRecord.record_digest,
    );
  });
});

function reconciliationProposal(overrides: Partial<ReconciliationProposalV1> = {}): ReconciliationProposalV1 {
  const fields = {
    family_id: "assertion-family:binary-status",
    family_version: "1",
    occurrence_key: "subject:case-7",
    left_record_id: "mem_a",
    right_record_id: "mem_b",
    relation: "contradicts" as const,
    comparison_system_as_of: "7",
    evidence_citation_ids: ["cit-a", "cit-b"],
    ...overrides,
  };
  const proposal = { ...fields, proposal_id: reconciliationProposalIdV1(fields) };
  return { ...proposal, proposal_digest: receiptDigest("reconciliation-proposal", proposal, "proposal_digest") };
}

function reconciliationOutcome(overrides: Partial<ReconciliationOutcomeV1> = {}): ReconciliationOutcomeV1 {
  const proposal = reconciliationProposal();
  const outcome = {
    registry_id: "registry:test",
    registry_version: "1",
    family_id: proposal.family_id,
    family_version: proposal.family_version,
    left_record_id: proposal.left_record_id,
    right_record_id: proposal.right_record_id,
    comparison_system_as_of: proposal.comparison_system_as_of,
    eligible: true,
    proposal,
    eligibility_digest: DIGEST,
    ...overrides,
  };
  return { ...outcome, receipt_digest: receiptDigest("reconciliation-outcome", outcome) };
}

describe("Reconciliation contracts", () => {
  it("accepts opaque credentials without a byte-length restriction and rejects non-strings", () => {
    const request = {
      family_id: "assertion-family:binary-status",
      family_version: "1",
      left_record_id: "mem_b",
      right_record_id: "mem_a",
      deadline_at: RECORDED_AT,
    };
    for (const credential of ["x".repeat(513), "", "é".repeat(257)]) {
      expect(validateReconciliationRequest({ ...request, authorization: { credential } })).toEqual({
        ok: true,
        value: { ...request, authorization: { credential } },
      });
    }
    for (const credential of [null, false, 42, {}, [], undefined]) {
      expect(validateReconciliationRequest({ ...request, authorization: { credential } })).toMatchObject({
        ok: false, error: { code: "INVALID_SCHEMA", operation: "propose_reconciliation" },
      });
    }
  });

  it("accepts a matching proposal and eligible or ineligible outcomes without a proposal", () => {
    const outcome = reconciliationOutcome();
    expect(validateReconciliationOutcome(outcome)).toEqual({ ok: true, value: outcome });
    const { proposal: _proposal, ...withoutProposal } = outcome;
    for (const eligible of [false, true]) {
      const fields = { ...withoutProposal, eligible };
      const value = { ...fields, receipt_digest: receiptDigest("reconciliation-outcome", fields) };
      expect(validateReconciliationOutcome(value)).toEqual({ ok: true, value });
    }
  });

  it.each([
    ["ineligible outcome", { eligible: false }],
    ["different family", { proposal: reconciliationProposal({ family_id: "assertion-family:other" }) }],
    ["different family version", { proposal: reconciliationProposal({ family_version: "2" }) }],
    ["different left record", { proposal: reconciliationProposal({ left_record_id: "mem_0" }) }],
    ["different right record", { proposal: reconciliationProposal({ right_record_id: "mem_c" }) }],
    ["different comparison cursor", { proposal: reconciliationProposal({ comparison_system_as_of: "8" }) }],
  ] satisfies Array<[string, Partial<ReconciliationOutcomeV1>]>)(
    "rejects an inconsistent reconciliation outcome: %s",
    (_name, overrides) => {
      expect(validateReconciliationOutcome(reconciliationOutcome(overrides))).toMatchObject({
        ok: false, error: { code: "INVALID_SCHEMA", operation: "propose_reconciliation" },
      });
    },
  );

  it.each([
    ["mem_a", "mem_a", false],
    ["mem_b", "mem_a", false],
    ["mem_\u{10000}", "mem_\uE000", false],
    ["mem_\uE000", "mem_\u{10000}", true],
  ] satisfies Array<[string, string, boolean]>)("requires distinct UTF-8 ascending outcome record ids: %s / %s", (left_record_id, right_record_id, ok) => {
    const pair = { left_record_id, right_record_id };
    const outcome = reconciliationOutcome({ ...pair, proposal: reconciliationProposal(pair) });
    expect(validateReconciliationOutcome(outcome)).toMatchObject(ok
      ? { ok: true, value: outcome }
      : { ok: false, error: { code: "INVALID_SCHEMA", operation: "propose_reconciliation" } });
  });

  it.each([
    ["unsorted", ["cit-b", "cit-a"]],
    ["duplicate", ["cit-a", "cit-a"]],
  ] satisfies Array<[string, string[]]>)("rejects %s evidence citation ids in outcomes and command bindings", (_name, evidence_citation_ids) => {
    const proposal = reconciliationProposal({ evidence_citation_ids });
    expect(validateReconciliationOutcome(reconciliationOutcome({ proposal }))).toMatchObject({
      ok: false, error: { code: "INVALID_SCHEMA", operation: "propose_reconciliation" },
    });
    expect(validateReconciliationCommandBinding({ proposal, registry_id: "registry:test", registry_version: "1" }))
      .toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA", operation: "dispute" } });
  });
});
