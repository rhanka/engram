import { describe, expect, it } from "vitest";

import {
  knowledgePayloadDigest,
  memoryRecordDigest,
  recordIdFromDigest,
  validateCandidatePayload,
  validateMemoryRecord,
} from "../graphify-memory/index.js";

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
