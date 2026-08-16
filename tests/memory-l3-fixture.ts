import {
  createInMemoryCanonicalMemoryStoreV1,
  createMemoryPortV2,
  receiptDigest,
  type Digest,
  type MemoryEngineDependenciesV2,
} from "../graphify-memory/index.js";

export const NOW = "2026-08-16T12:34:56.789Z";
export const DEADLINE = "2026-08-16T12:40:00.000Z";
export const DIGEST = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Digest;

export function captureRequest(idempotencyKey: string, sequence: string, text = "memory body") {
  return {
    schema_version: 2 as const,
    idempotency_key: idempotencyKey,
    payload: {
      schema_version: 2 as const,
      scope_ref: "scope:l3",
      purpose_ref: "purpose:l3",
      valid_time: { t: 1 },
      components: [{ component_id: "component:l3", kind: "context" as const, text, citation_ids: ["citation:l3"] }],
      primary_component_id: "component:l3",
      primary_event: { at: 1, type_ref: "event:l3", citation_id: "citation:l3" },
      citations: [{ citation_id: "citation:l3", source_ref: "source:l3", locator: { scheme: "document", value: "l3#one" }, content_digest: DIGEST }],
      retention: { derivative_rule: "retain" as const },
      reconciliation: { family_refs: [] },
    },
    evidence: { evidence_ref: "evidence:l3", evidence_digest: DIGEST, citation_ids: ["citation:l3"] },
    authorization: { credential: "credential:l3" },
    source_order: { source_ref: "source:l3", sequence },
    deadline_at: DEADLINE,
    cancellation_ref: `cancel:${sequence}`,
  };
}

export function createL3Memory(decision: "accept" | "reject" | "adjudication_required" = "accept") {
  const plaintext = new Map<string, string>();
  const destroyed: string[] = [];
  const store = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => NOW } });
  const authorization = {
    version: 1 as const,
    async authorize(request: { operation: string; resource_digest: Digest }) {
      const body = {
        allowed: true as const,
        decision_id: "decision:l3",
        policy_version: "1",
        operation: request.operation,
        resource_digest: request.resource_digest,
        scope_ref: "scope:l3",
        not_before: NOW,
        expires_at: DEADLINE,
        revocation_epoch: "0",
        redaction: { mode: "field-allowlist" as const, allowed_fields: [], allow_derivation_lineage: false, max_packet_bytes: 4_096 },
        authentication_receipt_digest: DIGEST,
      };
      return { ok: true as const, value: { ...body, receipt_digest: receiptDigest("authorization-allowed", body) } };
    },
    async revalidate(receipt_digest: Digest, checked_at: string) {
      const body = { receipt_digest, checked_at, valid: true, current_revocation_epoch: "0", reason: "valid" as const };
      return { ok: true as const, value: { ...body, revalidation_receipt_digest: receiptDigest("authorization-revalidation", body, "revalidation_receipt_digest") } };
    },
    async redact() { throw new Error("unused"); },
  };
  const policy = {
    policy_id: "policy:l3",
    policy_version: "1",
    async decide(request: { record_digest: Digest }) {
      const body = { policy_id: "policy:l3", policy_version: "1", record_digest: request.record_digest, decision, issued_at: NOW };
      return { ok: true as const, value: { ...body, receipt_digest: receiptDigest("admission-decision", body) } };
    },
  };
  const crypto = {
    version: 1 as const,
    async seal(input: { candidate_id: string; plaintext: string }) {
      plaintext.set(input.candidate_id, input.plaintext);
      const body = { candidate_id: input.candidate_id, envelope_ref: `envelope:${input.candidate_id}`, key_ref: `key:${input.candidate_id}`, ciphertext: `ciphertext:${input.candidate_id}` };
      return { ok: true as const, value: { ...body, envelope_digest: receiptDigest("sealed-candidate", body) } };
    },
    async open(input: { sealed: { candidate_id: string } }) {
      const value = plaintext.get(input.sealed.candidate_id);
      return value === undefined
        ? { ok: false as const, error: { code: "UNAUTHORIZED" as const, operation: "inspect_candidate" as const, message: "destroyed", retryable: false } }
        : { ok: true as const, value: { plaintext: value } };
    },
    async destroy(input: { key_ref: string }) {
      destroyed.push(input.key_ref);
      const body = { destroyed: true, key_ref: input.key_ref };
      return { ok: true as const, value: { destroyed: true, receipt_digest: receiptDigest("key-destruction", body) } };
    },
    async rotate() { throw new Error("unused"); },
  };
  const memory = createMemoryPortV2({
    canonical_store: store,
    authorization,
    admission_policy: policy,
    crypto,
    activity_sources: [],
    clock: { now: () => NOW },
  } as unknown as MemoryEngineDependenciesV2);
  return { memory, store, destroyed };
}

export function lifecycleCommand(operation: "dispute" | "resolve_dispute" | "expire" | "mark_non_current" | "trust_invalidate" | "tombstone", record_id: string, event_id = `event:${operation}`) {
  return {
    operation,
    event_id,
    record_id,
    reason_ref: `reason:${operation}`,
    event_anchor: { occurred_at: NOW, kind_ref: `kind:${operation}`, provenance_ref: "citation:l3", provenance_digest: DIGEST },
    authorization: { credential: "credential:l3" },
    deadline_at: DEADLINE,
  } as const;
}
