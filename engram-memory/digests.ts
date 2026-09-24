import { createHash } from "node:crypto";

import { canonicalizeJcs } from "./canonical-json.js";
import type { CandidatePayloadV2, Digest, MemoryRecordV2 } from "./contracts/index.js";

const PAYLOAD_DOMAIN = "graphify-memory/payload/v2\0";
const RECORD_DOMAIN = "graphify-memory/record/v2\0";

function digest(domain: string, value: unknown): Digest {
  const hash = createHash("sha256");
  hash.update(domain, "utf8");
  hash.update(canonicalizeJcs(value), "utf8");
  return `sha256:${hash.digest("hex")}` as Digest;
}

/**
 * Derives a receipt digest from every normalized receipt field other than the
 * digest field itself. Receipt kinds are protocol names, never authority
 * vocabulary.
 */
export function receiptDigest(kind: string, receipt: Record<string, unknown>, digestField = "receipt_digest"): Digest {
  const bound = { ...receipt };
  delete bound[digestField];
  return digest(`graphify-memory/${kind}/v1\0`, bound);
}

/** Binds an opaque policy-evidence reference without interpreting its content. */
export function policyEvidenceDigest(policyEvidenceRef: string): Digest {
  return digest("graphify-memory/policy-evidence/v1\0", { policy_evidence_ref: policyEvidenceRef });
}

/** Binds an authorization request's operation and data-only resource carrier. */
export function authorizationResourceDigest(operation: string, resource: Record<string, unknown>): Digest {
  return digest("graphify-memory/authorization-resource/v1\0", { operation, resource });
}

/** Digest of caller-submitted, immutable knowledge fields only. */
export function knowledgePayloadDigest(payload: CandidatePayloadV2 | Record<string, unknown>): Digest {
  return digest(PAYLOAD_DOMAIN, payload);
}

/**
 * Digest of the complete writer-owned record, excluding the two fields derived
 * from it. `record_id` must be excluded too: it is itself derived from these
 * digest bytes and including it would make the specified derivation circular.
 */
export function memoryRecordDigest(record: MemoryRecordV2 | Record<string, unknown>): Digest {
  const { record_id: _recordId, record_digest: _recordDigest, ...digestInput } = record;
  return digest(RECORD_DOMAIN, digestInput);
}

const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";

export function recordIdFromDigest(digestValue: Digest): string {
  const hex = digestValue.slice("sha256:".length);
  let bits = 0;
  let buffer = 0;
  let encoded = "";
  for (let index = 0; index < hex.length; index += 2) {
    const byte = Number.parseInt(hex.slice(index, index + 2), 16);
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      encoded += BASE32[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) encoded += BASE32[(buffer << (5 - bits)) & 31];
  return `mem_${encoded}`;
}
