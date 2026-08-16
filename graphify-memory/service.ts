import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import { chmod, readFile, rename, stat, writeFile } from "node:fs/promises";

import { applyPortOwnedRedaction } from "./engine.js";
import { knowledgePayloadDigest, receiptDigest } from "./digests.js";
import type {
  AdmissionPolicy,
  AdmissionPolicyRequestV1,
  AuthorizationAllowedV1,
  AuthorizationPort,
  AuthorizationRequestV1,
  ClockPort,
  CryptoPort,
  Digest,
  EvidenceVerifierPort,
  Result,
  TrustBindingV1,
} from "./contracts/index.js";

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_RECEIPT_MS = 300_000;

function refusal<T>(operation: Parameters<AuthorizationPort["authorize"]>[0]["operation"], code: "UNAUTHORIZED" | "AUTHORIZATION_EXPIRED" | "AUTHORIZATION_REVOKED" | "INVALID_SCHEMA" | "CAPABILITY_UNAVAILABLE" | "RESTORE_REFUSED", message: string): Result<T> {
  return { ok: false, error: { code, operation, message, retryable: false } };
}

function storeRefusal<T>(message: string): Result<T> {
  return { ok: false, error: { code: "STORE_UNAVAILABLE", operation: "admin", message, retryable: false } };
}

function isInstant(value: unknown): value is string {
  return typeof value === "string" && INSTANT_PATTERN.test(value) && new Date(value).toISOString() === value;
}

function isDigest(value: unknown): value is Digest {
  return typeof value === "string" && DIGEST_PATTERN.test(value);
}

function isOpaque(value: unknown): value is string {
  return typeof value === "string" && new TextEncoder().encode(value).byteLength >= 1 && new TextEncoder().encode(value).byteLength <= 512;
}

function nextInstant(now: string): string {
  return new Date(Date.parse(now) + MAX_RECEIPT_MS).toISOString();
}

function credentialDigest(credential: string): Digest {
  return receiptDigest("local-credential", { credential });
}

function securelyEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.byteLength === rightBytes.byteLength && timingSafeEqual(leftBytes, rightBytes);
}

export interface LocalCredentialSourceV1 {
  read(): Promise<Result<string | undefined>>;
  initialize(credential: string): Promise<Result<{ written: true }>>;
  replace(credential: string): Promise<Result<{ written: true }>>;
}

export interface LocalAdministrationStateV1 {
  credential_digest: Digest;
  epoch: string;
  revoked_credential_digests: ReadonlyArray<Digest>;
}

export interface LocalAdministrationStateStoreV1 {
  read(): Promise<Result<LocalAdministrationStateV1 | undefined>>;
  initialize(state: LocalAdministrationStateV1): Promise<Result<{ written: true }>>;
  replace(state: LocalAdministrationStateV1): Promise<Result<{ written: true }>>;
}

export interface LocalAdministrationFenceV1 {
  assertActive(): Promise<Result<{ active: true }>>;
}

export interface LocalAdministratorV1 {
  readonly authorization: AuthorizationPort;
  readonly admission_policy: AdmissionPolicy;
  readonly evidence_verifier: EvidenceVerifierPort;
  readonly crypto: CryptoPort;
  bootstrap(): Promise<Result<{ initialized: true }>>;
  rotate(credential: string): Promise<Result<{ rotated: true }>>;
  revoke(credential: string): Promise<Result<{ revoked: true }>>;
}

export interface LocalAdministratorOptionsV1 {
  clock: ClockPort;
  credentials: LocalCredentialSourceV1;
  state: LocalAdministrationStateStoreV1;
  fence: LocalAdministrationFenceV1;
}

/** Test-only source. Production callers select the dedicated file source or an OS credential-store adapter. */
export function createInMemoryLocalCredentialSourceV1(): LocalCredentialSourceV1 {
  let credential: string | undefined;
  return {
    async read() { return { ok: true, value: credential }; },
    async initialize(next) {
      if (credential !== undefined) return storeRefusal("credential source is already initialized");
      credential = next;
      return { ok: true, value: { written: true } };
    },
    async replace(next) { credential = next; return { ok: true, value: { written: true } }; },
  };
}

/**
 * Dedicated owner-only credential file. Its content is never read from a CLI,
 * environment variable, ordinary configuration, or log. Replacement uses a
 * same-directory atomic rename.
 */
export function createFileLocalCredentialSourceV1(path: string): LocalCredentialSourceV1 {
  return {
    async read() {
      try {
        const metadata = await stat(path);
        if ((metadata.mode & 0o077) !== 0) return storeRefusal("credential source permissions are not owner-only");
        return { ok: true, value: await readFile(path, "utf8") };
      } catch (error) {
        return (error as { code?: string }).code === "ENOENT"
          ? { ok: true, value: undefined }
          : storeRefusal("credential source cannot be read");
      }
    },
    async initialize(credential) {
      try {
        await writeFile(path, credential, { encoding: "utf8", mode: 0o600, flag: "wx" });
        await chmod(path, 0o600);
        return { ok: true, value: { written: true } };
      } catch {
        return storeRefusal("credential source cannot be initialized");
      }
    },
    async replace(credential) {
      const temporary = `${path}.${randomBytes(12).toString("hex")}.tmp`;
      try {
        await writeFile(temporary, credential, { encoding: "utf8", mode: 0o600, flag: "wx" });
        await chmod(temporary, 0o600);
        await rename(temporary, path);
        return { ok: true, value: { written: true } };
      } catch {
        return storeRefusal("credential source cannot be rotated");
      }
    },
  };
}

export function createInMemoryLocalAdministrationStateStoreV1(): LocalAdministrationStateStoreV1 {
  let state: LocalAdministrationStateV1 | undefined;
  return {
    async read() { return { ok: true, value: state }; },
    async initialize(next) {
      if (state !== undefined) return storeRefusal("administration state is already initialized");
      state = next;
      return { ok: true, value: { written: true } };
    },
    async replace(next) { state = next; return { ok: true, value: { written: true } }; },
  };
}

export function createAlwaysActiveLocalAdministrationFenceV1(): LocalAdministrationFenceV1 {
  return { async assertActive() { return { ok: true, value: { active: true } }; } };
}

function validState(state: LocalAdministrationStateV1 | undefined): state is LocalAdministrationStateV1 {
  return state !== undefined && isDigest(state.credential_digest) && /^(0|[1-9][0-9]*)$/.test(state.epoch)
    && state.revoked_credential_digests.every(isDigest);
}

function denied(request: AuthorizationRequestV1, now: string, reasonRef: string) {
  const body = {
    allowed: false as const,
    decision_id: "local:deny",
    policy_version: "1",
    operation: request.operation,
    resource_digest: request.resource_digest,
    issued_at: now,
    reason_ref: reasonRef,
  };
  return { ...body, receipt_digest: receiptDigest("authorization-denied", body) };
}

function trustBinding(payloadDigest: Digest, evidenceDigest: Digest, now: string, epoch: string): TrustBindingV1 {
  const body = {
    class: "asserted" as const,
    evidence_digest: evidenceDigest,
    verifier_id: "graphify-memory:local",
    verifier_version: "1",
    issued_at: now,
    revocation_epoch: epoch,
  };
  return { ...body, receipt_digest: receiptDigest("local-trust", { ...body, payload_digest: payloadDigest }) };
}

export function createLocalAdministratorV1(options: LocalAdministratorOptionsV1): LocalAdministratorV1 {
  const issuedAuthorizations = new Map<Digest, AuthorizationAllowedV1>();
  const issuedTrust = new Map<Digest, TrustBindingV1>();
  const keys = new Map<string, ReturnType<typeof randomBytes>>();

  const stateAndCredential = async (): Promise<Result<{ state: LocalAdministrationStateV1; credential: string }>> => {
    const state = await options.state.read();
    if (!state.ok) return state;
    const credential = await options.credentials.read();
    if (!credential.ok) return credential;
    if (!validState(state.value) || credential.value === undefined || credentialDigest(credential.value) !== state.value.credential_digest) {
      return refusal("admin", "UNAUTHORIZED", "local administration is not initialized with a usable credential");
    }
    return { ok: true, value: { state: state.value, credential: credential.value } };
  };

  const authorization: AuthorizationPort = {
    version: 1,
    async authorize(request) {
      const now = options.clock.now();
      if (!isInstant(now) || !isInstant(request.deadline_at) || Date.parse(now) >= Date.parse(request.deadline_at)
        || !isDigest(request.resource_digest) || !isOpaque(request.resource.scope_ref) || typeof request.context.credential !== "string") {
        return { ok: true, value: denied(request, isInstant(now) ? now : "1970-01-01T00:00:00.000Z", "local:invalid-request") };
      }
      const current = await stateAndCredential();
      if (!current.ok || !securelyEqual(request.context.credential, current.value.credential)
        || current.value.state.revoked_credential_digests.includes(current.value.state.credential_digest)) {
        return { ok: true, value: denied(request, now, "local:denied") };
      }
      const authenticationReceipt = receiptDigest("local-authentication", {
        credential_digest: current.value.state.credential_digest,
        authorization_epoch: current.value.state.epoch,
      });
      const body = {
        allowed: true as const,
        decision_id: `local:authorization-${randomBytes(12).toString("hex")}`,
        policy_version: "1",
        operation: request.operation,
        resource_digest: request.resource_digest,
        scope_ref: request.resource.scope_ref,
        not_before: now,
        expires_at: nextInstant(now),
        revocation_epoch: current.value.state.epoch,
        redaction: {
          mode: "field-allowlist" as const,
          allowed_fields: ["/citations", "/components", "/primary_component_id", "/primary_event", "/purpose_ref", "/reconciliation", "/retention", "/schema_version", "/scope_ref", "/valid_time"],
          allow_derivation_lineage: false,
          max_packet_bytes: 1_048_576,
        },
        authentication_receipt_digest: authenticationReceipt,
      };
      const allowed = { ...body, receipt_digest: receiptDigest("authorization-allowed", body) };
      issuedAuthorizations.set(allowed.receipt_digest, allowed);
      return { ok: true, value: allowed };
    },
    async revalidate(receiptDigestValue, checkedAt) {
      const now = isInstant(checkedAt) ? checkedAt : options.clock.now();
      const current = await stateAndCredential();
      const receipt = issuedAuthorizations.get(receiptDigestValue);
      let valid = false;
      let reason: "valid" | "expired" | "revoked" | "unknown" = "unknown";
      let epoch = "0";
      if (current.ok) {
        epoch = current.value.state.epoch;
        if (receipt !== undefined) {
          if (receipt.revocation_epoch !== epoch || current.value.state.revoked_credential_digests.includes(current.value.state.credential_digest)) reason = "revoked";
          else if (!isInstant(now) || Date.parse(now) >= Date.parse(receipt.expires_at)) reason = "expired";
          else { valid = true; reason = "valid"; }
        }
      }
      const body = { receipt_digest: receiptDigestValue, checked_at: now, valid, current_revocation_epoch: epoch, reason };
      return { ok: true, value: { ...body, revalidation_receipt_digest: receiptDigest("authorization-revalidation", body, "revalidation_receipt_digest") } };
    },
    async redact(request) {
      const defaultDirective = {
        mode: "field-allowlist" as const,
        allowed_fields: ["/citations", "/components", "/primary_component_id", "/primary_event", "/purpose_ref", "/reconciliation", "/retention", "/schema_version", "/scope_ref", "/valid_time"],
        allow_derivation_lineage: false,
        max_packet_bytes: 1_048_576,
      };
      if (request.target_scope_ref !== request.source_record.scope_ref) return refusal("recall_current", "UNAUTHORIZED", "local redaction requires an exact scope match");
      const redacted = applyPortOwnedRedaction(request.source_record, defaultDirective);
      if (!redacted.ok) return redacted;
      const payload = redacted.value as typeof request.source_record;
      const outputPayloadDigest = knowledgePayloadDigest(payload);
      const body = {
        payload,
        source_record_digest: request.source_record.record_digest,
        output_payload_digest: outputPayloadDigest,
        policy_version: "1",
      };
      return { ok: true, value: { ...body, receipt_digest: receiptDigest("redaction", body) } };
    },
  };

  const admission_policy: AdmissionPolicy = {
    policy_id: "local:admission",
    policy_version: "1",
    async decide(request: AdmissionPolicyRequestV1) {
      const now = options.clock.now();
      if (!isInstant(now)) return refusal("request_admission", "CAPABILITY_UNAVAILABLE", "clock did not supply a canonical instant");
      const current = await stateAndCredential();
      if (!current.ok) return refusal("request_admission", "UNAUTHORIZED", "local admission policy is not initialized");
      const body = {
        policy_id: "local:admission",
        policy_version: "1",
        record_digest: request.record_digest,
        decision: "adjudication_required" as const,
        issued_at: now,
      };
      return { ok: true, value: { ...body, receipt_digest: receiptDigest("admission-decision", body) } };
    },
  };

  const evidence_verifier: EvidenceVerifierPort = {
    verifier_id: "graphify-memory:local",
    verifier_version: "1",
    async classify(request) {
      const now = options.clock.now();
      if (!isInstant(now) || !isDigest(request.payload_digest) || !isDigest(request.evidence.evidence_digest)) {
        return refusal("capture", "INVALID_SCHEMA", "local verifier received malformed evidence");
      }
      const current = await stateAndCredential();
      if (!current.ok) return refusal("capture", "UNAUTHORIZED", "local verifier is not initialized");
      const binding = trustBinding(request.payload_digest, request.evidence.evidence_digest, now, current.value.state.epoch);
      issuedTrust.set(binding.receipt_digest, binding);
      return { ok: true, value: binding };
    },
    async revalidate(receiptDigestValue, checkedAt) {
      const current = await stateAndCredential();
      const binding = issuedTrust.get(receiptDigestValue);
      const valid = current.ok && binding !== undefined && binding.revocation_epoch === current.value.state.epoch && isInstant(checkedAt)
        && (binding.expires_at === undefined || Date.parse(checkedAt) < Date.parse(binding.expires_at));
      const reason: "valid" | "expired" | "revoked" | "unknown" = !current.ok || binding === undefined ? "unknown" : !valid && binding.revocation_epoch !== current.value.state.epoch ? "revoked" : !valid ? "expired" : "valid";
      const body = { binding_receipt_digest: receiptDigestValue, checked_at: checkedAt, valid, current_revocation_epoch: current.ok ? current.value.state.epoch : "0", reason };
      return { ok: true, value: { ...body, revalidation_receipt_digest: receiptDigest("trust-revalidation", body, "revalidation_receipt_digest") } };
    },
  };

  const crypto: CryptoPort = {
    version: 1,
    async seal(input) {
      const key = randomBytes(32);
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(Buffer.from(input.context_digest, "utf8"));
      const ciphertext = Buffer.concat([cipher.update(input.plaintext, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      const keyRef = `local:key-${randomBytes(12).toString("hex")}`;
      keys.set(keyRef, key);
      const packed = `${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
      const body = { candidate_id: input.candidate_id, envelope_ref: `local:envelope-${randomBytes(12).toString("hex")}`, key_ref: keyRef, ciphertext: packed };
      return { ok: true, value: { ...body, envelope_digest: receiptDigest("sealed-candidate", body) } };
    },
    async open(input) {
      const key = keys.get(input.sealed.key_ref);
      if (key === undefined) return refusal("inspect_candidate", "UNAUTHORIZED", "pending envelope key is unavailable");
      try {
        const [iv, tag, ciphertext] = input.sealed.ciphertext.split(".");
        if (iv === undefined || tag === undefined || ciphertext === undefined) throw new Error("invalid ciphertext");
        const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
        decipher.setAAD(Buffer.from(input.context_digest, "utf8"));
        decipher.setAuthTag(Buffer.from(tag, "base64url"));
        return { ok: true, value: { plaintext: Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8") } };
      } catch {
        return refusal("inspect_candidate", "INVALID_SCHEMA", "pending envelope cannot be authenticated");
      }
    },
    async destroy(input) {
      const destroyed = keys.delete(input.key_ref);
      const body = { destroyed, key_ref: input.key_ref, idempotency_key: input.idempotency_key };
      return { ok: true, value: { destroyed, receipt_digest: receiptDigest("key-destruction", body) } };
    },
    async rotate(input) {
      if (!keys.has(input.key_ref)) return refusal("admin", "UNAUTHORIZED", "pending envelope key is unavailable");
      const keyRef = `local:key-${randomBytes(12).toString("hex")}`;
      keys.set(keyRef, randomBytes(32));
      const body = { key_ref: keyRef, previous_key_ref: input.key_ref, idempotency_key: input.idempotency_key };
      return { ok: true, value: { key_ref: keyRef, receipt_digest: receiptDigest("key-rotation", body) } };
    },
  };

  const bootstrap = async (): Promise<Result<{ initialized: true }>> => {
    try {
      const fence = await options.fence.assertActive();
      if (!fence.ok) return fence;
      const state = await options.state.read();
      const credential = await options.credentials.read();
      if (!state.ok) return state;
      if (!credential.ok) return credential;
      if (state.value !== undefined || credential.value !== undefined) return refusal("admin", "RESTORE_REFUSED", "local administration may only initialize empty state; no recovery bypass exists");
      const nextCredential = randomBytes(32).toString("base64url");
      const credentialWrite = await options.credentials.initialize(nextCredential);
      if (!credentialWrite.ok) return credentialWrite;
      const stateWrite = await options.state.initialize({ credential_digest: credentialDigest(nextCredential), epoch: "0", revoked_credential_digests: [] });
      return stateWrite.ok ? { ok: true, value: { initialized: true } } : stateWrite;
    } catch {
      return storeRefusal("local administration initialization failed");
    }
  };

  const rotate = async (credential: string): Promise<Result<{ rotated: true }>> => {
    const current = await stateAndCredential();
    if (!current.ok || !securelyEqual(credential, current.value.credential)) return refusal("admin", "UNAUTHORIZED", "local credential does not authorize rotation");
    const fence = await options.fence.assertActive();
    if (!fence.ok) return fence;
    const nextCredential = randomBytes(32).toString("base64url");
    const credentialWrite = await options.credentials.replace(nextCredential);
    if (!credentialWrite.ok) return credentialWrite;
    const nextEpoch = (BigInt(current.value.state.epoch) + 1n).toString();
    const stateWrite = await options.state.replace({
      credential_digest: credentialDigest(nextCredential),
      epoch: nextEpoch,
      revoked_credential_digests: [...current.value.state.revoked_credential_digests, current.value.state.credential_digest],
    });
    return stateWrite.ok ? { ok: true, value: { rotated: true } } : stateWrite;
  };

  const revoke = async (credential: string): Promise<Result<{ revoked: true }>> => {
    const current = await stateAndCredential();
    if (!current.ok || !securelyEqual(credential, current.value.credential)) return refusal("admin", "UNAUTHORIZED", "local credential does not authorize revocation");
    const fence = await options.fence.assertActive();
    if (!fence.ok) return fence;
    const stateWrite = await options.state.replace({
      credential_digest: current.value.state.credential_digest,
      epoch: (BigInt(current.value.state.epoch) + 1n).toString(),
      revoked_credential_digests: [...current.value.state.revoked_credential_digests, current.value.state.credential_digest],
    });
    return stateWrite.ok ? { ok: true, value: { revoked: true } } : stateWrite;
  };

  return { authorization, admission_policy, evidence_verifier, crypto, bootstrap, rotate, revoke };
}
