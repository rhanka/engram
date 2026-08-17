import { describe, expect, it } from "vitest";

import {
  createMemoryPortV2,
  receiptDigest,
  type MemoryEngineDependenciesV2,
} from "../graphify-memory/index.js";

const DIGEST = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function capture(payloadText = "first") {
  return {
    schema_version: 2,
    idempotency_key: "idempotency-key-0001",
    payload: {
      schema_version: 2,
      scope_ref: "scope:case-7",
      purpose_ref: "purpose:case",
      valid_time: { t: 1 },
      components: [{ component_id: "component:one", kind: "context", text: payloadText, citation_ids: ["citation:one"] }],
      primary_component_id: "component:one",
      primary_event: { at: 1, type_ref: "event:one", citation_id: "citation:one" },
      citations: [{ citation_id: "citation:one", source_ref: "source:case", locator: { scheme: "document", value: "case#one" }, content_digest: DIGEST }],
      retention: { derivative_rule: "retain" },
      reconciliation: { family_refs: [] },
    },
    evidence: { evidence_ref: "evidence:case", evidence_digest: DIGEST, citation_ids: ["citation:one"] },
    authorization: { credential: "opaque-credential" },
    source_order: { source_ref: "source:case", sequence: "1" },
    deadline_at: "2026-08-16T12:40:00.000Z",
    cancellation_ref: "cancel:case",
  } as const;
}

describe("capture seam", () => {
  it("exact duplicate acknowledges and digest conflict writes nothing", async () => {
    const commits: unknown[] = [];
    const memory = createMemoryPortV2({
      canonical_store: {
        async commitPending(input: unknown) {
          commits.push(input);
          if (commits.length === 1) return { ok: true, value: { cursor: "1", committed_at: "2026-08-16T12:34:56.789Z" } };
          if (commits.length === 2) return { ok: true, value: { cursor: "1", committed_at: "2026-08-16T12:34:56.789Z", outcome: "duplicate_exact" } };
          return { ok: false, error: { code: "DIGEST_CONFLICT", operation: "capture", message: "conflict", retryable: false } };
        },
      },
      authorization: {
        version: 1,
        async authorize(request) {
          const partial = {
            allowed: true as const,
            decision_id: "decision:case",
            policy_version: "1",
            operation: request.operation,
            resource_digest: request.resource_digest,
            scope_ref: "scope:case-7",
            not_before: "2026-08-16T12:34:56.789Z",
            expires_at: "2026-08-16T12:39:56.789Z",
            revocation_epoch: "0",
            redaction: { mode: "field-allowlist" as const, allowed_fields: [], allow_derivation_lineage: false, max_packet_bytes: 4_096 },
            authentication_receipt_digest: DIGEST,
          };
          return { ok: true, value: { ...partial, receipt_digest: receiptDigest("authorization-allowed", partial) } };
        },
        async revalidate(receipt_digest, checked_at) {
          const partial = { receipt_digest, checked_at, valid: true, current_revocation_epoch: "0", reason: "valid" as const };
          return { ok: true, value: { ...partial, revalidation_receipt_digest: receiptDigest("authorization-revalidation", partial, "revalidation_receipt_digest") } };
        },
        async redact() { throw new Error("unused"); },
      },
      admission_policy: { policy_id: "policy:case", policy_version: "1", async decide() { throw new Error("capture never admits"); } },
      crypto: {
        version: 1,
        async seal(input) {
          return { ok: true, value: { candidate_id: input.candidate_id, envelope_ref: "envelope:case", envelope_digest: receiptDigest("sealed", { plaintext: input.plaintext }), key_ref: "key:case", ciphertext: input.plaintext } };
        },
        async open() { throw new Error("unused"); },
        async destroy() { throw new Error("unused"); },
        async rotate() { throw new Error("unused"); },
      },
      activity_sources: [],
      clock: { now: () => "2026-08-16T12:34:56.789Z" },
    } as unknown as MemoryEngineDependenciesV2);

    await expect(memory.capture(capture())).resolves.toMatchObject({ ok: true, value: { status: "committed_pending" } });
    await expect(memory.capture(capture())).resolves.toMatchObject({ ok: true, value: { status: "duplicate_exact" } });
    await expect(memory.capture(capture("changed"))).resolves.toMatchObject({ ok: false, error: { code: "DIGEST_CONFLICT" } });
    expect(commits).toHaveLength(2);
  });
});
