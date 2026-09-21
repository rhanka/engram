import { describe, expect, it } from "vitest";

import {
  attestationReceiptDigest,
  createCanonicalMemoryStoreFactoryV1,
  createCapabilityAttestationPairV1,
  verifyCapabilityAttestation,
  type CanonicalMemoryStorePort,
  type CapabilityAttestationIdentityV1,
  type Digest,
  type FencedStoreConstructionV1,
  type OperationalCapabilityReceiptV1,
  type Result,
} from "../graphify-memory/index.js";

const NOW = "2026-09-21T12:00:00.000Z";
const DEADLINE = "2026-09-21T12:05:00.000Z";
const BUILD = ("sha256:" + "b".repeat(64)) as Digest;
const identity: CapabilityAttestationIdentityV1 = { adapter_id: "adapter:graphify-sqlite", adapter_version: "1", adapter_build_digest: BUILD };
const caps = { atomic_promotion: true, dense_cursor: true, accepted_only_lexical: true, fenced_single_writer: true, revocable_active_store: true, detached_snapshot: true, bounded_cancellation: true, backend: "sqlite" as const };

/** A base (unattested) production store: readiness carries no adapter fields; the factory adds and signs them. */
function baseStore(): CanonicalMemoryStorePort {
  const base: OperationalCapabilityReceiptV1 = { store_id: "store:prod", backend: "sqlite", storage_epoch: "7", high_water_cursor: "9", capabilities: caps, issued_at: NOW, expires_at: DEADLINE, receipt_digest: ("sha256:" + "0".repeat(64)) as Digest };
  return new Proxy({} as CanonicalMemoryStorePort, {
    get(_t, prop) {
      if (prop === "readiness") return async () => ({ ok: true as const, value: base });
      if (prop === "close") return async () => ({ ok: true as const, value: { closed: true as const } });
      return async () => ({ ok: false as const, error: { code: "STORE_UNAVAILABLE" as const, operation: "admin" as const, message: "unused", retryable: false } });
    },
  });
}
const construction: FencedStoreConstructionV1 = { store_id: "store:prod", backend: "sqlite", deadline_at: DEADLINE };
const code = (r: Result<unknown>) => (r.ok ? "OK" : r.error.code);
const acquireReadiness = async (signer: Parameters<typeof createCanonicalMemoryStoreFactoryV1>[0]["attestation_signer"]) => {
  const factory = createCanonicalMemoryStoreFactoryV1({ attestation_signer: signer, open: async () => ({ ok: true, value: baseStore() }) });
  const acquired = await factory.acquire(construction);
  if (!acquired.ok) throw new Error("acquire failed");
  const receipt = await acquired.value.readiness();
  if (!receipt.ok) throw new Error("readiness failed");
  return { factory, receipt: receipt.value };
};

describe("capability attestation emission (§5.9, R1j-a2)", () => {
  it("the factory emits an attestation that verifyCapabilityAttestation admits (the sense whose absence bricked production)", async () => {
    const { signer, verifier } = createCapabilityAttestationPairV1(identity);
    const { factory, receipt } = await acquireReadiness(signer);
    expect(factory.adapter_id).toBe("adapter:graphify-sqlite"); // derived from signer.identity
    expect(receipt.adapter_id).toBe("adapter:graphify-sqlite");
    expect(receipt.adapter_build_digest).toBe(BUILD);
    expect(receipt.attestation_signature?.startsWith("ed25519:")).toBe(true);
    expect(code(verifyCapabilityAttestation(receipt, verifier, "capture"))).toBe("OK");
  });

  it("a matched pair round-trips and rejects a signature over a different digest or an altered algorithm prefix", () => {
    const { signer, verifier } = createCapabilityAttestationPairV1(identity);
    const d1 = ("sha256:" + "1".repeat(64)) as Digest;
    const sig = signer.sign(d1);
    expect(verifier.verifySignature({ receipt_digest: d1, attestation_signature: sig })).toBe(true);
    expect(verifier.verifySignature({ receipt_digest: ("sha256:" + "2".repeat(64)) as Digest, attestation_signature: sig })).toBe(false);
    expect(verifier.verifySignature({ receipt_digest: d1, attestation_signature: `rogue:${sig.slice("ed25519:".length)}` })).toBe(false);
  });

  it("rejects an emitted receipt whose field is mutated then re-digested but not re-signed (the signature binds the digest)", async () => {
    const { signer, verifier } = createCapabilityAttestationPairV1(identity);
    const { receipt } = await acquireReadiness(signer);
    const mutated = { ...receipt, high_water_cursor: "999" };
    const reDigested = { ...mutated, receipt_digest: attestationReceiptDigest(mutated) }; // recompute-match now passes...
    expect(code(verifyCapabilityAttestation(reDigested, verifier, "capture"))).toBe("CAPABILITY_UNAVAILABLE"); // ...but the signature was over the old digest
  });

  it("rejects when the verifier expects a different adapter build digest (cross-pair)", async () => {
    const { signer } = createCapabilityAttestationPairV1(identity);
    const other = createCapabilityAttestationPairV1({ ...identity, adapter_build_digest: ("sha256:" + "c".repeat(64)) as Digest });
    const { receipt } = await acquireReadiness(signer);
    expect(code(verifyCapabilityAttestation(receipt, other.verifier, "capture"))).toBe("CAPABILITY_UNAVAILABLE");
  });
});
