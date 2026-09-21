import { describe, expect, it } from "vitest";

import {
  attestationReceiptDigest,
  verifyCapabilityAttestation,
  type CapabilityAttestationVerifierPort,
  type Digest,
  type OperationalCapabilityReceiptV1,
  type Result,
} from "../graphify-memory/index.js";

const NOW = "2026-09-20T12:00:00.000Z";
const DEADLINE = "2026-09-20T12:04:00.000Z";
const DIGEST = ("sha256:" + "a".repeat(64)) as Digest;
const SIG = "ed25519:c2ln";

function receipt(overrides: Partial<OperationalCapabilityReceiptV1> = {}): OperationalCapabilityReceiptV1 {
  const base: OperationalCapabilityReceiptV1 = {
    store_id: "store:prod",
    backend: "sqlite",
    storage_epoch: "7",
    high_water_cursor: "0",
    capabilities: { atomic_promotion: true, dense_cursor: true, accepted_only_lexical: true, fenced_single_writer: true, revocable_active_store: true, detached_snapshot: true, bounded_cancellation: true, backend: "sqlite" },
    adapter_id: "adapter:graphify-sqlite",
    adapter_version: "1",
    adapter_build_digest: DIGEST,
    attestation_signature: SIG,
    issued_at: NOW,
    expires_at: DEADLINE,
    receipt_digest: DIGEST,
    ...overrides,
  };
  // a well-formed receipt carries the canonical digest over its own fields (attestation_signature/receipt_digest excluded).
  return { ...base, receipt_digest: attestationReceiptDigest(base) };
}

const verifier = (accept = true): CapabilityAttestationVerifierPort => ({
  version: 1,
  expected_adapter_id: "adapter:graphify-sqlite",
  expected_adapter_version: "1",
  expected_adapter_build_digest: DIGEST,
  verifySignature: () => accept,
});

const code = (r: Result<unknown>) => (r.ok ? "OK" : r.error.code);

describe("verifyCapabilityAttestation (§5.9)", () => {
  it("admits a production SQLite receipt whose attestation matches the expected adapter and verifies (embedded-local prod)", () => {
    expect(verifyCapabilityAttestation(receipt(), verifier(true), "capture").ok).toBe(true);
  });

  it("admits a production Postgres receipt likewise (external-host alike)", () => {
    const pg = receipt({ backend: "postgres", capabilities: { ...receipt().capabilities, backend: "postgres" } });
    expect(verifyCapabilityAttestation(pg, verifier(true), "capture").ok).toBe(true);
  });

  it("admits a non-production (memory) receipt with no attestation block and no verifier", () => {
    // built directly (not via receipt()): a memory receipt carries no adapter fields, and memory is admitted
    // before any digest/signature check, so receipt_digest is irrelevant here.
    const mem: OperationalCapabilityReceiptV1 = {
      store_id: "store:mem", backend: "memory", storage_epoch: "0", high_water_cursor: "0",
      capabilities: { atomic_promotion: true, dense_cursor: true, accepted_only_lexical: true, fenced_single_writer: false, revocable_active_store: false, detached_snapshot: false, bounded_cancellation: false, backend: "memory" },
      issued_at: NOW, expires_at: DEADLINE, receipt_digest: DIGEST,
    };
    expect(verifyCapabilityAttestation(mem, undefined, "capture").ok).toBe(true);
  });

  it("rejects a production receipt when no attestation verifier is configured", () => {
    expect(code(verifyCapabilityAttestation(receipt(), undefined, "capture"))).toBe("CAPABILITY_UNAVAILABLE");
  });

  it("rejects a production receipt whose attestation block is absent (present => must-verify)", () => {
    expect(code(verifyCapabilityAttestation(receipt({ attestation_signature: undefined }), verifier(true), "capture"))).toBe("CAPABILITY_UNAVAILABLE");
  });

  it("rejects a production receipt whose adapter binding mismatches the expected identity", () => {
    expect(code(verifyCapabilityAttestation(receipt({ adapter_version: "2" }), verifier(true), "capture"))).toBe("CAPABILITY_UNAVAILABLE");
    expect(code(verifyCapabilityAttestation(receipt({ adapter_id: "adapter:rogue" }), verifier(true), "capture"))).toBe("CAPABILITY_UNAVAILABLE");
    expect(code(verifyCapabilityAttestation(receipt({ adapter_build_digest: (("sha256:" + "b".repeat(64)) as Digest) }), verifier(true), "capture"))).toBe("CAPABILITY_UNAVAILABLE");
  });

  it("rejects a production receipt whose detached signature does not verify", () => {
    expect(code(verifyCapabilityAttestation(receipt(), verifier(false), "capture"))).toBe("CAPABILITY_UNAVAILABLE");
  });

  it("rejects a production receipt whose receipt_digest no longer matches its fields (tampered without re-digesting)", () => {
    // graphify recomputes the canonical digest: a field mutated after signing, without re-digesting, is caught
    // before any crypto — an accepting verifier cannot rescue it.
    const tampered = { ...receipt(), high_water_cursor: "999" };
    expect(code(verifyCapabilityAttestation(tampered, verifier(true), "capture"))).toBe("CAPABILITY_UNAVAILABLE");
  });
});
