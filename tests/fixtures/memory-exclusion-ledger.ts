import { generateKeyPairSync, sign, verify } from "node:crypto";
import type { ExclusionLedgerSignerPortV1, ExclusionLedgerVerifierPortV1 } from "../../engram-memory/contracts/index.js";

/** Host-owned, ephemeral Ed25519 keys: never shipped by the memory package. */
export function exclusionLedgerHost() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const signer: ExclusionLedgerSignerPortV1 = {
    async sign(ledger_digest) {
      return { algorithm: "Ed25519", key_id: "host:test-key", signature: sign(null, Buffer.from(ledger_digest, "utf8"), privateKey).toString("base64") };
    },
  };
  const verifier: ExclusionLedgerVerifierPortV1 = {
    async verify(ledger_digest, attestation) {
      return attestation.algorithm === "Ed25519" && attestation.key_id === "host:test-key"
        && verify(null, Buffer.from(ledger_digest, "utf8"), publicKey, Buffer.from(attestation.signature, "base64"));
    },
  };
  return { exclusion_ledger_signer: signer, exclusion_ledger_verifier: verifier, publicKey };
}
