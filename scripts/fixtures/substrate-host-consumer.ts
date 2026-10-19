// Strict, compile-only host composition through installed public specifiers.
import {
  createMemoryPortV2, openModuleStorageCanonicalMemoryStoreV1,
  type AdmissionPolicy, type AuthorizationPort, type ClockPort, type CryptoPort,
  type Digest, type GuardedMemoryPortV2, type MemoryEngineDependenciesV2,
  type ModuleStorageMemoryStoreOptionsV1, type Result, type SealedCandidateEnvelopeV1,
} from "@sentropic/engram/memory-substrate";

// @ts-expect-error private source subpath is not published
import * as privateFactory from "@sentropic/engram/engram-memory/store-factory";
// @ts-expect-error internal module subpath is not published
import * as internalBinding from "@sentropic/engram/memory-substrate/internal";
// @ts-expect-error dist paths cannot bypass the public exports map
import * as privateBundle from "@sentropic/engram/dist/memory-substrate.js";

const digest: Digest = `sha256:${"a".repeat(64)}`;
const clock: ClockPort = { now: () => "2026-08-16T12:34:56.000Z" };
const authorization: AuthorizationPort = {
  version: 1,
  async authorize(request) {
    return { ok: true, value: {
      allowed: false, decision_id: "decision:consumer", policy_version: "1",
      operation: request.operation, resource_digest: request.resource_digest,
      issued_at: clock.now(), reason_ref: "reason:consumer", receipt_digest: digest,
    } };
  },
  async revalidate(receipt_digest, checked_at) {
    return { ok: true, value: { receipt_digest, checked_at, valid: true,
      current_revocation_epoch: "0", reason: "valid", revalidation_receipt_digest: digest } };
  },
  async redact(request) {
    return { ok: true, value: { payload: request.source_record,
      source_record_digest: request.source_record.record_digest,
      output_payload_digest: request.source_record.payload_digest,
      policy_version: "1", receipt_digest: digest } };
  },
};
const admission_policy: AdmissionPolicy = {
  policy_id: "policy:consumer", policy_version: "1",
  async decide(request) {
    return { ok: true, value: { policy_id: this.policy_id, policy_version: this.policy_version,
      record_digest: request.record_digest, decision: "reject", issued_at: clock.now(), receipt_digest: digest } };
  },
};
const crypto: CryptoPort = {
  version: 1,
  async seal(input) {
    return { ok: true, value: { candidate_id: input.candidate_id,
      envelope_ref: "envelope:consumer", key_ref: "key:consumer",
      ciphertext: input.plaintext, envelope_digest: input.context_digest } };
  },
  async open(input) { return { ok: true, value: { plaintext: input.sealed.ciphertext } }; },
  async destroy(input) { return { ok: true, value: { destroyed: true, receipt_digest: digest } }; },
  async rotate(input) { return { ok: true, value: { key_ref: input.key_ref, receipt_digest: digest } }; },
};

export async function consumeHost(options: ModuleStorageMemoryStoreOptionsV1): Promise<Result<GuardedMemoryPortV2>> {
  const opened = await openModuleStorageCanonicalMemoryStoreV1({ ...options, clock });
  if (!opened.ok) return opened;
  const dependencies: MemoryEngineDependenciesV2 = {
    canonical_store: opened.value, authorization, admission_policy, crypto, activity_sources: [], clock,
  };
  const sealed: Result<SealedCandidateEnvelopeV1> = await crypto.seal({
    candidate_id: "candidate:consumer", plaintext: "fixture", context_digest: digest,
  });
  if (!sealed.ok) return sealed;
  const plaintext: Result<{ plaintext: string }> = await crypto.open({ sealed: sealed.value, context_digest: digest });
  const rotated: Result<{ key_ref: string; receipt_digest: Digest }> = await crypto.rotate({ key_ref: sealed.value.key_ref, idempotency_key: "rotate:consumer" });
  const destroyed: Result<{ destroyed: boolean; receipt_digest: Digest }> = await crypto.destroy({ key_ref: sealed.value.key_ref, idempotency_key: "destroy:consumer" });
  if (!plaintext.ok) return plaintext;
  if (!rotated.ok) return rotated;
  if (!destroyed.ok) return destroyed;
  return { ok: true, value: createMemoryPortV2(dependencies) };
}
