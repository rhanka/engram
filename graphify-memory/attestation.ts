import type {
  CapabilityAttestationVerifierPort,
  MemoryOperation,
  OperationalCapabilityReceiptV1,
  Result,
} from "./contracts/index.js";

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
  // the detached signature binds the adapter identity + store_id + storage_epoch; delegate the crypto check only.
  if (!verifier.verifySignature({ receipt })) {
    return unattested(operation, "capability attestation signature did not verify against the expected adapter identity");
  }
  return { ok: true, value: receipt };
}
