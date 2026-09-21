import { receiptDigest } from "./digests.js";
import type {
  CapabilityAttestationVerifierPort,
  Digest,
  MemoryOperation,
  OperationalCapabilityReceiptV1,
  Result,
} from "./contracts/index.js";

/**
 * §5.9 canonical attestation digest — the SINGLE definition used by BOTH the emitter (the fenced-store factory)
 * and the verifier path here, so they cannot desync. It excludes `attestation_signature` (the signature is
 * detached over this digest) AND `receipt_digest` (non-circularity: the digest does not cover itself), and
 * covers everything else — including the adapter identity binding.
 */
export function attestationReceiptDigest(receipt: OperationalCapabilityReceiptV1): Digest {
  const { attestation_signature: _signature, ...rest } = receipt;
  return receiptDigest("operational-capability", rest);
}

function unattested<T>(operation: MemoryOperation, message: string): Result<T> {
  return { ok: false, error: { code: "CAPABILITY_UNAVAILABLE", operation, message, retryable: false } };
}

/**
 * §5.9 admission predicate — verified by the engine BEFORE any fencing-dependent operation, never delegated
 * to the store's own readiness(). A non-production store (backend "memory") omits attestation and is admitted
 * for operations that do not require production fencing. A production store (sqlite/postgres) is admitted only
 * when its fresh receipt carries a complete attestation block that matches the EXPECTED graphify-owned adapter
 * identity and whose detached signature verifies (the signature binds the adapter identity + store_id +
 * storage_epoch). Absent, mismatched, or unverifiable attestation is rejected exactly as an unfenced store.
 */
export function verifyCapabilityAttestation(
  receipt: OperationalCapabilityReceiptV1,
  verifier: CapabilityAttestationVerifierPort | undefined,
  operation: MemoryOperation,
): Result<OperationalCapabilityReceiptV1> {
  // non-production stores omit attestation and are usable only where production fencing is not required.
  if (receipt.backend === "memory") return { ok: true, value: receipt };
  // production (sqlite/postgres): a fresh receipt satisfies fencing only with a verified attestation block.
  if (verifier === undefined) return unattested(operation, "no capability attestation verifier is configured for a production canonical store");
  const { adapter_id, adapter_version, adapter_build_digest, attestation_signature } = receipt;
  if (adapter_id === undefined || adapter_version === undefined || adapter_build_digest === undefined || attestation_signature === undefined) {
    return unattested(operation, "production capability receipt lacks the attestation block (present => must-verify)");
  }
  if (adapter_id !== verifier.expected_adapter_id
    || adapter_version !== verifier.expected_adapter_version
    || adapter_build_digest !== verifier.expected_adapter_build_digest) {
    return unattested(operation, "capability receipt adapter binding does not match the expected graphify adapter identity");
  }
  // §5.9: graphify recomputes the canonical digest and compares it to receipt_digest — a field tampered without
  // re-signing is caught here, before any crypto (graphify owns the canonical encoding on both sides).
  if (attestationReceiptDigest(receipt) !== receipt.receipt_digest) {
    return unattested(operation, "capability receipt_digest does not match its canonical attestation digest");
  }
  // the host verifier does PURE crypto over the graphify-computed digest: a signature over a different digest fails.
  if (!verifier.verifySignature({ receipt_digest: receipt.receipt_digest, attestation_signature })) {
    return unattested(operation, "capability attestation signature did not verify against the expected adapter identity");
  }
  return { ok: true, value: receipt };
}
