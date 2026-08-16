import { canonicalizeJcs, normalizeCanonicalJson, type CanonicalJsonValue } from "./canonical-json.js";
import {
  authorizationResourceDigest,
  knowledgePayloadDigest,
  memoryRecordDigest,
  policyEvidenceDigest,
  receiptDigest,
  recordIdFromDigest,
} from "./digests.js";
import { isCanonicalCursor, validateCandidatePayload } from "./validation.js";
import type {
  AdmissionDecisionEnvelopeV1,
  AdmissionPolicy,
  AdmissionPolicyRequestV1,
  AuthorizationAllowedV1,
  AuthorizationPort,
  AuthorizationRequestV1,
  AuthorizationResultV1,
  CandidatePayloadV2,
  CaptureAcknowledgementV1,
  CaptureRequestV2,
  Digest,
  MemoryEngineDependenciesV2,
  MemoryErrorCode,
  MemoryOperation,
  MemoryPortV2,
  MemoryRecordV2,
  RedactionDirectiveV1,
  Result,
  TrustBindingV1,
} from "./contracts/index.js";

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ZERO_DIGEST = `sha256:${"0".repeat(64)}` as Digest;
const DECISION_MAX_AGE_MS = 300_000;

type JsonObject = Record<string, CanonicalJsonValue>;

function refusal<T>(operation: MemoryOperation, code: MemoryErrorCode, message: string): Result<T> {
  return { ok: false, error: { code, operation, message, retryable: false } };
}

function unavailable<T>(operation: MemoryOperation, message = "the configured capability is unavailable"): Result<T> {
  return refusal(operation, "CAPABILITY_UNAVAILABLE", message);
}

function isDigest(value: unknown): value is Digest {
  return typeof value === "string" && DIGEST_PATTERN.test(value);
}

function isInstant(value: unknown): value is string {
  return typeof value === "string" && INSTANT_PATTERN.test(value) && new Date(value).toISOString() === value;
}

function isOpaque(value: unknown): value is string {
  return typeof value === "string" && new TextEncoder().encode(value).byteLength >= 1 && new TextEncoder().encode(value).byteLength <= 512;
}

function exactObject(value: unknown, keys: readonly string[]): JsonObject | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const object = value as JsonObject;
  const actual = Object.keys(object);
  return actual.length === keys.length && actual.every((key) => keys.includes(key)) ? object : undefined;
}

function optionalExactObject(value: unknown, required: readonly string[], optional: readonly string[]): JsonObject | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const object = value as JsonObject;
  const actual = Object.keys(object);
  return required.every((key) => Object.hasOwn(object, key)) && actual.every((key) => required.includes(key) || optional.includes(key))
    ? object
    : undefined;
}

function normalizeObject(value: unknown): JsonObject | undefined {
  try {
    const normalized = normalizeCanonicalJson(value);
    return normalized !== null && typeof normalized === "object" && !Array.isArray(normalized) ? normalized : undefined;
  } catch {
    return undefined;
  }
}

function compareInstants(left: string, right: string): number {
  return Date.parse(left) - Date.parse(right);
}

function operationFailure(operation: MemoryOperation, result: Result<never>): Result<never> {
  return result.ok ? result : { ok: false, error: { ...result.error, operation } };
}

function validateRedactionDirective(input: unknown): RedactionDirectiveV1 | undefined {
  const directive = exactObject(input, ["mode", "allowed_fields", "allow_derivation_lineage", "max_packet_bytes"]);
  if (directive === undefined || directive.mode !== "field-allowlist" || typeof directive.allow_derivation_lineage !== "boolean"
    || typeof directive.max_packet_bytes !== "number" || !Number.isSafeInteger(directive.max_packet_bytes) || directive.max_packet_bytes < 1 || !Array.isArray(directive.allowed_fields)) {
    return undefined;
  }
  let previous: string | undefined;
  for (const field of directive.allowed_fields) {
    if (typeof field !== "string" || (!field.startsWith("/") && field !== "") || (previous !== undefined && previous >= field)) return undefined;
    previous = field;
  }
  return directive as unknown as RedactionDirectiveV1;
}

function parseAllowedAuthorization(input: unknown): AuthorizationAllowedV1 | undefined {
  const value = normalizeObject(input);
  const allowed = exactObject(value, [
    "allowed", "decision_id", "policy_version", "operation", "resource_digest", "scope_ref", "not_before", "expires_at",
    "revocation_epoch", "redaction", "authentication_receipt_digest", "receipt_digest",
  ]);
  if (allowed === undefined || allowed.allowed !== true || !isOpaque(allowed.decision_id) || !isOpaque(allowed.policy_version)
    || typeof allowed.operation !== "string" || !isDigest(allowed.resource_digest) || !isOpaque(allowed.scope_ref)
    || !isInstant(allowed.not_before) || !isInstant(allowed.expires_at) || !isCanonicalCursor(allowed.revocation_epoch)
    || !isDigest(allowed.authentication_receipt_digest) || !isDigest(allowed.receipt_digest)
    || validateRedactionDirective(allowed.redaction) === undefined) {
    return undefined;
  }
  if (allowed.receipt_digest !== receiptDigest("authorization-allowed", allowed as unknown as Record<string, unknown>)) return undefined;
  return allowed as unknown as AuthorizationAllowedV1;
}

function isNormalizedDenied(input: unknown): boolean {
  const value = normalizeObject(input);
  const denied = exactObject(value, ["allowed", "decision_id", "policy_version", "operation", "resource_digest", "issued_at", "reason_ref", "receipt_digest"]);
  return denied !== undefined
    && denied.allowed === false
    && isOpaque(denied.decision_id)
    && isOpaque(denied.policy_version)
    && typeof denied.operation === "string"
    && isDigest(denied.resource_digest)
    && isInstant(denied.issued_at)
    && isOpaque(denied.reason_ref)
    && isDigest(denied.receipt_digest)
    && denied.receipt_digest === receiptDigest("authorization-denied", denied as unknown as Record<string, unknown>);
}

export interface AuthorizationBindingInputV1 {
  request: Pick<AuthorizationRequestV1, "operation" | "resource_digest">;
  expected_scope_ref?: string;
  checked_at: string;
}

/**
 * Validates only the normalized authorization result's structural, temporal,
 * and exact request bindings. It never interprets an opaque credential or
 * scope reference.
 */
export function validateAuthorizationAllowed(input: AuthorizationBindingInputV1, result: AuthorizationAllowedV1): Result<AuthorizationAllowedV1> {
  const allowed = parseAllowedAuthorization(result);
  if (allowed === undefined) return refusal(input.request.operation, "INVALID_SCHEMA", "authorization result is not an exact normalized allow receipt");
  if (allowed.operation !== input.request.operation || allowed.resource_digest !== input.request.resource_digest
    || (input.expected_scope_ref !== undefined && allowed.scope_ref !== input.expected_scope_ref)) {
    return refusal(input.request.operation, "UNAUTHORIZED", "authorization result does not exactly bind the requested operation, resource, and scope");
  }
  if (!isInstant(input.checked_at) || compareInstants(input.checked_at, allowed.not_before) < 0) {
    return refusal(input.request.operation, "UNAUTHORIZED", "authorization result is not active yet");
  }
  if (compareInstants(input.checked_at, allowed.expires_at) >= 0) {
    return refusal(input.request.operation, "AUTHORIZATION_EXPIRED", "authorization result has expired");
  }
  return { ok: true, value: allowed };
}

function validateRevalidation(input: unknown, receiptDigestValue: Digest, expectedEpoch: string, checkedAt: string, operation: MemoryOperation): Result<{ valid: true }> {
  const value = normalizeObject(input);
  const packet = exactObject(value, ["receipt_digest", "checked_at", "valid", "current_revocation_epoch", "reason", "revalidation_receipt_digest"]);
  if (packet === undefined || packet.receipt_digest !== receiptDigestValue || !isInstant(packet.checked_at)
    || typeof packet.valid !== "boolean" || !isCanonicalCursor(packet.current_revocation_epoch)
    || !["valid", "expired", "revoked", "unknown"].includes(String(packet.reason)) || !isDigest(packet.revalidation_receipt_digest)
    || packet.revalidation_receipt_digest !== receiptDigest("authorization-revalidation", packet as unknown as Record<string, unknown>, "revalidation_receipt_digest")) {
    return refusal(operation, "INVALID_SCHEMA", "authorization revalidation is malformed or unbound");
  }
  if (packet.valid === true && packet.reason === "valid" && packet.current_revocation_epoch === expectedEpoch) return { ok: true, value: { valid: true } };
  const code = packet.reason === "revoked" || packet.current_revocation_epoch !== expectedEpoch
    ? "AUTHORIZATION_REVOKED"
    : packet.reason === "expired"
      ? "AUTHORIZATION_EXPIRED"
      : "UNAUTHORIZED";
  return refusal(operation, code, `authorization receipt is ${String(packet.reason)}`);
}

/** Invokes and revalidates the injected authority; no public request carries its result. */
export async function authorizeOperation(
  port: AuthorizationPort,
  request: AuthorizationRequestV1,
  expectedScopeRef: string | undefined,
  checkedAt: string,
): Promise<Result<AuthorizationAllowedV1>> {
  try {
    const authorized = await port.authorize(request);
    if (!authorized.ok) return operationFailure(request.operation, authorized);
    if (authorized.value.allowed === false) {
      return isNormalizedDenied(authorized.value)
        ? refusal(request.operation, "UNAUTHORIZED", "authorization was denied by the configured port")
        : refusal(request.operation, "INVALID_SCHEMA", "authorization denial is not normalized");
    }
    const bound = validateAuthorizationAllowed({ request, expected_scope_ref: expectedScopeRef, checked_at: checkedAt }, authorized.value);
    if (!bound.ok) return bound;
    const revalidated = await port.revalidate(bound.value.receipt_digest, checkedAt);
    if (!revalidated.ok) return operationFailure(request.operation, revalidated);
    const active = validateRevalidation(revalidated.value, bound.value.receipt_digest, bound.value.revocation_epoch, checkedAt, request.operation);
    return active.ok ? bound : active;
  } catch {
    return unavailable(request.operation, "authorization port did not return a typed result");
  }
}

function decodePointer(pointer: string): string[] | undefined {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) return undefined;
  const segments: string[] = [];
  for (const segment of pointer.slice(1).split("/")) {
    if (/~(?:[^01]|$)/.test(segment)) return undefined;
    segments.push(segment.replaceAll("~1", "/").replaceAll("~0", "~"));
  }
  return segments;
}

function cloneJson(value: CanonicalJsonValue): CanonicalJsonValue {
  return normalizeCanonicalJson(value);
}

function applyAllowedPath(source: CanonicalJsonValue, target: JsonObject, segments: readonly string[]): void {
  if (segments.length === 0) {
    for (const [key, value] of Object.entries(source as JsonObject)) target[key] = cloneJson(value);
    return;
  }
  const [head, ...tail] = segments;
  if (Array.isArray(source) || source === null || typeof source !== "object" || !Object.hasOwn(source, head!)) return;
  const child = source[head!]!;
  if (tail.length === 0) {
    target[head!] = cloneJson(child);
    return;
  }
  if (Array.isArray(child)) return; // array element omission would expose a non-allowlisted structural substitute
  if (child === null || typeof child !== "object") return;
  const existing = target[head!];
  const childTarget = existing !== null && typeof existing === "object" && !Array.isArray(existing)
    ? existing as JsonObject
    : {};
  target[head!] = childTarget;
  applyAllowedPath(child, childTarget, tail);
}

/** Applies exactly the provider-owned field allowlist by omission, never transformation. */
export function applyPortOwnedRedaction(value: CandidatePayloadV2, directiveInput: RedactionDirectiveV1): Result<unknown> {
  const directive = validateRedactionDirective(directiveInput);
  if (directive === undefined) return refusal("recall_current", "INVALID_SCHEMA", "redaction directive is not normalized");
  let source: CanonicalJsonValue;
  try {
    source = normalizeCanonicalJson(value);
  } catch {
    return refusal("recall_current", "INVALID_SCHEMA", "redaction source is not canonical JSON");
  }
  if (source === null || typeof source !== "object" || Array.isArray(source)) return refusal("recall_current", "INVALID_SCHEMA", "redaction source must be an object");
  const output: JsonObject = {};
  for (const pointer of directive.allowed_fields) {
    const path = decodePointer(pointer);
    if (path === undefined || (!directive.allow_derivation_lineage && path[0] === "derivation")) continue;
    applyAllowedPath(source, output, path);
  }
  if (!directive.allow_derivation_lineage) delete output.derivation;
  if (new TextEncoder().encode(canonicalizeJcs(output)).byteLength > directive.max_packet_bytes) {
    return refusal("recall_current", "CAPABILITY_UNAVAILABLE", "redaction packet exceeds the authorization-owned byte bound");
  }
  return { ok: true, value: output };
}

function validateSixFieldEnvelope(input: unknown): AdmissionDecisionEnvelopeV1 | undefined {
  const value = normalizeObject(input);
  const envelope = exactObject(value, ["policy_id", "policy_version", "record_digest", "decision", "issued_at", "receipt_digest"]);
  if (envelope === undefined || !isOpaque(envelope.policy_id) || !isOpaque(envelope.policy_version)
    || !isDigest(envelope.record_digest) || !["accept", "reject", "adjudication_required"].includes(String(envelope.decision))
    || !isInstant(envelope.issued_at) || !isDigest(envelope.receipt_digest)
    || envelope.receipt_digest !== receiptDigest("admission-decision", envelope as unknown as Record<string, unknown>)) return undefined;
  return envelope as unknown as AdmissionDecisionEnvelopeV1;
}

/** Validates the sole policy output shape; authority evaluation remains inside the port. */
export function validateAdmissionDecisionEnvelope(
  policy: Pick<AdmissionPolicy, "policy_id" | "policy_version">,
  request: Pick<AdmissionPolicyRequestV1, "record_digest" | "payload_digest" | "policy_evidence_digest" | "policy_evidence_ref">,
  input: AdmissionDecisionEnvelopeV1,
  checkedAt: string,
): Result<AdmissionDecisionEnvelopeV1> {
  if (!isDigest(request.record_digest) || !isDigest(request.payload_digest) || !isOpaque(request.policy_evidence_ref)
    || request.policy_evidence_digest !== policyEvidenceDigest(request.policy_evidence_ref)) {
    return refusal("request_admission", "INVALID_DIGEST", "policy evidence does not bind its opaque reference");
  }
  const envelope = validateSixFieldEnvelope(input);
  if (envelope === undefined) return refusal("request_admission", "INVALID_SCHEMA", "admission decision is not an exact six-field envelope");
  if (envelope.policy_id !== policy.policy_id || envelope.policy_version !== policy.policy_version) {
    return refusal("request_admission", "POLICY_STALE", "admission decision does not bind the configured policy version");
  }
  if (envelope.record_digest !== request.record_digest) return refusal("request_admission", "INVALID_DIGEST", "admission decision does not bind the immutable record");
  if (!isInstant(checkedAt) || compareInstants(envelope.issued_at, checkedAt) > 0 || compareInstants(checkedAt, envelope.issued_at) > DECISION_MAX_AGE_MS) {
    return refusal("request_admission", "POLICY_STALE", "admission decision is not timely");
  }
  return { ok: true, value: envelope };
}

interface ValidCaptureRequest {
  request: CaptureRequestV2;
  payload: CandidatePayloadV2;
  payload_digest: Digest;
}

function validateCaptureRequest(input: unknown, now: string): Result<ValidCaptureRequest> {
  const value = normalizeObject(input);
  const request = exactObject(value, ["schema_version", "idempotency_key", "payload", "evidence", "authorization", "source_order", "deadline_at", "cancellation_ref"]);
  if (request === undefined || request.schema_version !== 2 || !isOpaque(request.idempotency_key)
    || new TextEncoder().encode(request.idempotency_key as string).byteLength < 16 || !isInstant(request.deadline_at)
    || !isOpaque(request.cancellation_ref)) return refusal("capture", "INVALID_SCHEMA", "capture request is not exact");
  if (compareInstants(now, request.deadline_at as string) >= 0) return refusal("capture", "DEADLINE_EXCEEDED", "capture deadline elapsed before commit");
  const sourceOrder = exactObject(request.source_order, ["source_ref", "sequence"]);
  const authorization = optionalExactObject(request.authorization, ["credential"], ["context_ref"]);
  const evidence = optionalExactObject(request.evidence, ["evidence_ref", "evidence_digest", "citation_ids"], ["attestation"]);
  if (sourceOrder === undefined || !isOpaque(sourceOrder.source_ref) || !isCanonicalCursor(sourceOrder.sequence)
    || authorization === undefined || typeof authorization.credential !== "string" || (Object.hasOwn(authorization, "context_ref") && !isOpaque(authorization.context_ref))
    || evidence === undefined || !isOpaque(evidence.evidence_ref) || !isDigest(evidence.evidence_digest) || !Array.isArray(evidence.citation_ids)
    || evidence.citation_ids.some((citation) => !isOpaque(citation))) {
    return refusal("capture", "INVALID_SCHEMA", "capture request contains invalid neutral carriers");
  }
  const payload = validateCandidatePayload(request.payload);
  if (!payload.ok) return operationFailure("capture", payload);
  return { ok: true, value: { request: request as unknown as CaptureRequestV2, payload: payload.value.payload, payload_digest: payload.value.payload_digest } };
}

function captureIdentity(request: CaptureRequestV2): string {
  return `candidate_${receiptDigest("capture-identity", {
    source_ref: request.source_order.source_ref,
    sequence: request.source_order.sequence,
    idempotency_key: request.idempotency_key,
  }).slice("sha256:".length)}`;
}

function pendingContextDigest(candidateId: string): Digest {
  return receiptDigest("pending-context", { candidate_id: candidateId });
}

function defaultTrust(payloadDigest: Digest, evidenceDigest: Digest, issuedAt: string): TrustBindingV1 {
  const fields = {
    class: "asserted" as const,
    evidence_digest: evidenceDigest,
    verifier_id: "graphify-memory:asserted",
    verifier_version: "1",
    issued_at: issuedAt,
    revocation_epoch: "0",
  };
  return { ...fields, receipt_digest: receiptDigest("asserted-trust", { ...fields, payload_digest: payloadDigest }) };
}

function verifiedTrust(binding: unknown): binding is TrustBindingV1 {
  const value = normalizeObject(binding);
  return value !== undefined && optionalExactObject(value,
    ["class", "evidence_digest", "verifier_id", "verifier_version", "issued_at", "revocation_epoch", "receipt_digest"],
    ["expires_at"],
  ) !== undefined && ["asserted", "earned", "signed"].includes(String(value.class)) && isDigest(value.evidence_digest)
    && isOpaque(value.verifier_id) && isOpaque(value.verifier_version) && isInstant(value.issued_at) && isCanonicalCursor(value.revocation_epoch)
    && isDigest(value.receipt_digest) && (!Object.hasOwn(value, "expires_at") || isInstant(value.expires_at));
}

async function classifyTrust(dependencies: MemoryEngineDependenciesV2, payloadDigest: Digest, request: CaptureRequestV2, now: string): Promise<Result<TrustBindingV1>> {
  if (dependencies.evidence_verifier === undefined) return { ok: true, value: defaultTrust(payloadDigest, request.evidence.evidence_digest, now) };
  try {
    const classified = await dependencies.evidence_verifier.classify({ payload_digest: payloadDigest, evidence: request.evidence, deadline_at: request.deadline_at });
    if (!classified.ok) return operationFailure("capture", classified);
    return verifiedTrust(classified.value)
      ? { ok: true, value: classified.value }
      : refusal("capture", "INVALID_SCHEMA", "evidence verifier returned an invalid trust binding");
  } catch {
    return unavailable("capture", "evidence verifier did not return a typed result");
  }
}

function recordForPending(payload: CandidatePayloadV2, payloadDigest: Digest, authorizationReceipt: Digest, trust: TrustBindingV1, recordedAt: string, cursor: string): MemoryRecordV2 {
  const preliminary = {
    ...payload,
    record_id: "mem_pending",
    payload_digest: payloadDigest,
    record_digest: ZERO_DIGEST,
    recorded_at: recordedAt,
    recorded_cursor: cursor,
    authorization_receipt_digest: authorizationReceipt,
    trust,
  };
  const recordDigest = memoryRecordDigest(preliminary);
  return { ...preliminary, record_id: recordIdFromDigest(recordDigest), record_digest: recordDigest };
}

interface PendingEnvelopeV1 {
  schema_version: 1;
  payload: CandidatePayloadV2;
  evidence: CaptureRequestV2["evidence"];
  authorization_receipt_digest: Digest;
  trust: TrustBindingV1;
  recorded_at: string;
}

function pendingEnvelope(payload: CandidatePayloadV2, request: CaptureRequestV2, authorizationReceipt: Digest, trust: TrustBindingV1, now: string): PendingEnvelopeV1 {
  return { schema_version: 1, payload, evidence: request.evidence, authorization_receipt_digest: authorizationReceipt, trust, recorded_at: now };
}

function captureEvent(request: CaptureRequestV2, candidateId: string, authorizationReceipt: Digest, recordedAt: string) {
  const body = {
    schema_version: 2 as const,
    event_id: request.idempotency_key,
    cursor: "0",
    recorded_at: recordedAt,
    operation: "capture" as const,
    candidate_id: candidateId,
    to_state: "pending" as const,
    authorization_receipt_digest: authorizationReceipt,
    previous_event_digest: ZERO_DIGEST,
  };
  return { ...body, event_digest: receiptDigest("event", body) };
}

function captureContentDigest(payloadDigest: Digest, request: CaptureRequestV2): Digest {
  return receiptDigest("capture-content", {
    payload_digest: payloadDigest,
    evidence: request.evidence,
    source_order: request.source_order,
    idempotency_key: request.idempotency_key,
  });
}

function admissionRequestIsExact(input: unknown): input is { candidate_id: string; authorization: { credential: string; context_ref?: string }; deadline_at: string } {
  const value = normalizeObject(input);
  const request = exactObject(value, ["candidate_id", "authorization", "deadline_at"]);
  const authorization = request === undefined ? undefined : optionalExactObject(request.authorization, ["credential"], ["context_ref"]);
  return request !== undefined && isOpaque(request.candidate_id) && isInstant(request.deadline_at)
    && authorization !== undefined && typeof authorization.credential === "string"
    && (!Object.hasOwn(authorization, "context_ref") || isOpaque(authorization.context_ref));
}

function parsePendingEnvelope(input: unknown): PendingEnvelopeV1 | undefined {
  const value = normalizeObject(input);
  const envelope = exactObject(value, ["schema_version", "payload", "evidence", "authorization_receipt_digest", "trust", "recorded_at"]);
  if (envelope === undefined || envelope.schema_version !== 1 || !isDigest(envelope.authorization_receipt_digest) || !isInstant(envelope.recorded_at)) return undefined;
  const payload = validateCandidatePayload(envelope.payload);
  if (!payload.ok || !verifiedTrust(envelope.trust)) return undefined;
  const evidence = optionalExactObject(envelope.evidence, ["evidence_ref", "evidence_digest", "citation_ids"], ["attestation"]);
  if (evidence === undefined || !isOpaque(evidence.evidence_ref) || !isDigest(evidence.evidence_digest) || !Array.isArray(evidence.citation_ids)
    || evidence.citation_ids.some((citation) => !isOpaque(citation))) return undefined;
  return envelope as unknown as PendingEnvelopeV1;
}

function validPendingSnapshot(input: unknown, candidateId: string): input is { control: { candidate_id: string; envelope_digest: Digest; state: "pending"; created_cursor: string; policy_id: string; policy_version: string }; sealed: { candidate_id: string; envelope_ref: string; envelope_digest: Digest; key_ref: string; ciphertext: string } } {
  const value = normalizeObject(input);
  const snapshot = exactObject(value, ["control", "sealed"]);
  if (snapshot === undefined) return false;
  const control = exactObject(snapshot.control, ["candidate_id", "envelope_digest", "state", "created_cursor", "policy_id", "policy_version"]);
  const sealed = exactObject(snapshot.sealed, ["candidate_id", "envelope_ref", "envelope_digest", "key_ref", "ciphertext"]);
  return control !== undefined && sealed !== undefined && control.candidate_id === candidateId && sealed.candidate_id === candidateId
    && control.state === "pending" && isDigest(control.envelope_digest) && control.envelope_digest === sealed.envelope_digest
    && isCanonicalCursor(control.created_cursor) && isOpaque(control.policy_id) && isOpaque(control.policy_version)
    && isOpaque(sealed.envelope_ref) && isOpaque(sealed.key_ref) && typeof sealed.ciphertext === "string";
}

function admissionEvent(candidateId: string, record: MemoryRecordV2, authorizationReceipt: Digest, decision: AdmissionDecisionEnvelopeV1) {
  const body = {
    schema_version: 2 as const,
    event_id: `admission:${candidateId}`,
    cursor: "0",
    recorded_at: record.recorded_at,
    operation: decision.decision === "accept" ? "accept" as const : "reject" as const,
    candidate_id: candidateId,
    record_id: decision.decision === "accept" ? record.record_id : undefined,
    to_state: decision.decision === "accept" ? "accepted_current" as const : "rejected" as const,
    record_digest: decision.decision === "accept" ? record.record_digest : undefined,
    authorization_receipt_digest: authorizationReceipt,
    admission_decision: decision,
    previous_event_digest: ZERO_DIGEST,
  };
  return { ...body, event_digest: receiptDigest("event", body) };
}

function lexicalDocument(record: MemoryRecordV2) {
  const text = (kind: "context" | "decision" | "evidence") => record.components.filter((component) => component.kind === kind).map((component) => component.text).join("\n");
  return {
    record_id: record.record_id,
    fields: {
      primary: record.components.find((component) => component.component_id === record.primary_component_id)?.text ?? "",
      context: text("context"),
      decision: text("decision"),
      evidence: text("evidence"),
      citations: record.citations.map((citation) => citation.source_ref).join("\n"),
    },
    valid_time: record.valid_time,
    trust_class: record.trust.class,
    record_digest: record.record_digest,
  };
}

/** L2 coordination only: it validates/seals pending capture and delegates durability to the canonical store. */
export function createMemoryPortV2(dependencies: MemoryEngineDependenciesV2): MemoryPortV2 {
  const cancelled = new Set<string>();
  const capturedContent = new Map<string, Digest>();

  return {
    version: 2,
    capabilities: async () => unavailable("admin"),
    validate: (payload) => {
      const validated = validateCandidatePayload(payload);
      return validated.ok ? { ok: true, value: { payload_digest: validated.value.payload_digest } } : operationFailure("capture", validated);
    },
    capture: async (input): Promise<Result<CaptureAcknowledgementV1>> => {
      const now = dependencies.clock?.now();
      if (!isInstant(now)) return unavailable("capture", "clock did not supply a canonical instant");
      const checked = validateCaptureRequest(input, now);
      if (!checked.ok) return checked;
      const { request, payload, payload_digest } = checked.value;
      if (cancelled.has(request.cancellation_ref)) return refusal("capture", "CANCELLED", "capture was cancelled before commit");
      const candidateId = captureIdentity(request);
      const contentDigest = captureContentDigest(payload_digest, request);
      const previous = capturedContent.get(candidateId);
      if (previous !== undefined && previous !== contentDigest) return refusal("capture", "DIGEST_CONFLICT", "idempotency identity is already bound to different capture content");

      const resource = { scope_ref: payload.scope_ref };
      const authorization = await authorizeOperation(dependencies.authorization, {
        operation: "capture",
        resource,
        resource_digest: authorizationResourceDigest("capture", resource),
        context: request.authorization,
        issued_at: now,
        deadline_at: request.deadline_at,
      }, payload.scope_ref, now);
      if (!authorization.ok) return authorization;
      if (cancelled.has(request.cancellation_ref)) return refusal("capture", "CANCELLED", "capture was cancelled before commit");
      const trust = await classifyTrust(dependencies, payload_digest, request, now);
      if (!trust.ok) return trust;
      try {
        const sealed = await dependencies.crypto.seal({
          candidate_id: candidateId,
          plaintext: canonicalizeJcs(pendingEnvelope(payload, request, authorization.value.receipt_digest, trust.value, now)),
          context_digest: pendingContextDigest(candidateId),
        });
        if (!sealed.ok) return operationFailure("capture", sealed);
        const committed = await dependencies.canonical_store.commitPending({
          control: {
            candidate_id: candidateId,
            envelope_digest: sealed.value.envelope_digest,
            state: "pending",
            created_cursor: "0",
            policy_id: dependencies.admission_policy.policy_id,
            policy_version: dependencies.admission_policy.policy_version,
          },
          sealed: sealed.value,
          capture_event: captureEvent(request, candidateId, authorization.value.receipt_digest, now),
        });
        if (!committed.ok) return operationFailure("capture", committed);
        const receipt = committed.value as typeof committed.value & { outcome?: "committed_pending" | "duplicate_exact" };
        if (!isCanonicalCursor(receipt.cursor) || !isInstant(receipt.committed_at)) return refusal("capture", "INVALID_SCHEMA", "pending commit did not return a durable receipt");
        capturedContent.set(candidateId, contentDigest);
        const record = recordForPending(payload, payload_digest, authorization.value.receipt_digest, trust.value, now, receipt.cursor);
        return {
          ok: true,
          value: {
            status: receipt.outcome === "duplicate_exact" ? "duplicate_exact" : "committed_pending",
            candidate_id: candidateId,
            record_digest: record.record_digest,
            cursor: receipt.cursor,
            transaction_receipt_digest: receipt.receipt_digest,
          },
        };
      } catch {
        return unavailable("capture", "capture dependencies did not return typed results");
      }
    },
    cancelCapture: async (cancellationRef) => {
      cancelled.add(cancellationRef);
      return { ok: true, value: { cancelled: true } };
    },
    requestAdmission: async (input) => {
      if (!admissionRequestIsExact(input)) return refusal("request_admission", "INVALID_SCHEMA", "admission request is not exact");
      const now = dependencies.clock?.now();
      if (!isInstant(now)) return unavailable("request_admission", "clock did not supply a canonical instant");
      if (Date.parse(now) >= Date.parse(input.deadline_at)) return refusal("request_admission", "DEADLINE_EXCEEDED", "admission deadline elapsed before decision");
      const resource = { candidate_id: input.candidate_id };
      const authorization = await authorizeOperation(dependencies.authorization, {
        operation: "request_admission",
        resource,
        resource_digest: authorizationResourceDigest("request_admission", resource),
        context: input.authorization,
        issued_at: now,
        deadline_at: input.deadline_at,
      }, undefined, now);
      if (!authorization.ok) return authorization;
      try {
        const pending = await dependencies.canonical_store.readPending({
          candidate_id: input.candidate_id,
          authorization_receipt_digest: authorization.value.receipt_digest,
        });
        if (!pending.ok) return operationFailure("request_admission", pending);
        if (!validPendingSnapshot(pending.value, input.candidate_id)) return refusal("request_admission", "INVALID_SCHEMA", "pending candidate snapshot is malformed");
        const opened = await dependencies.crypto.open({ sealed: pending.value.sealed, context_digest: pendingContextDigest(input.candidate_id) });
        if (!opened.ok) return operationFailure("request_admission", opened);
        let decoded: unknown;
        try {
          decoded = JSON.parse(opened.value.plaintext);
        } catch {
          return refusal("request_admission", "INVALID_SCHEMA", "pending envelope is not canonical JSON");
        }
        const envelope = parsePendingEnvelope(decoded);
        if (envelope === undefined) return refusal("request_admission", "INVALID_SCHEMA", "pending envelope is malformed");
        if (authorization.value.scope_ref !== envelope.payload.scope_ref) return refusal("request_admission", "UNAUTHORIZED", "authorization scope does not exactly bind the pending candidate");
        if (pending.value.control.policy_id !== dependencies.admission_policy.policy_id || pending.value.control.policy_version !== dependencies.admission_policy.policy_version) {
          return refusal("request_admission", "POLICY_STALE", "pending candidate policy does not match the configured policy");
        }
        const payloadDigest = knowledgePayloadDigest(envelope.payload);
        const record = recordForPending(envelope.payload, payloadDigest, envelope.authorization_receipt_digest, envelope.trust, envelope.recorded_at, pending.value.control.created_cursor);
        const policyRequest: AdmissionPolicyRequestV1 = {
          policy_id: dependencies.admission_policy.policy_id,
          policy_version: dependencies.admission_policy.policy_version,
          record_digest: record.record_digest,
          payload_digest: payloadDigest,
          candidate_envelope_ref: pending.value.sealed.envelope_ref,
          policy_evidence_digest: policyEvidenceDigest(envelope.evidence.evidence_ref),
          policy_evidence_ref: envelope.evidence.evidence_ref,
          deadline_at: input.deadline_at,
        };
        const decided = await dependencies.admission_policy.decide(policyRequest);
        if (!decided.ok) return operationFailure("request_admission", decided);
        const decision = validateAdmissionDecisionEnvelope(dependencies.admission_policy, policyRequest, decided.value, now);
        if (!decision.ok) return decision;
        if (decision.value.decision === "adjudication_required") {
          const transactionReceipt = receiptDigest("admission-pending", {
            candidate_id: input.candidate_id,
            cursor: pending.value.control.created_cursor,
            decision_receipt_digest: decision.value.receipt_digest,
          });
          return {
            ok: true,
            value: {
              status: "pending_adjudication",
              candidate_id: input.candidate_id,
              cursor: pending.value.control.created_cursor,
              decision_receipt_digest: decision.value.receipt_digest,
              transaction_receipt_digest: transactionReceipt,
            },
          };
        }
        const event = admissionEvent(input.candidate_id, record, authorization.value.receipt_digest, decision.value);
        const projectionBatch = {
          from_cursor_exclusive: pending.value.control.created_cursor,
          through_cursor_inclusive: pending.value.control.created_cursor,
          records: [],
          removals: [],
          batch_digest: receiptDigest("projection-batch", { candidate_id: input.candidate_id, record_digest: record.record_digest }),
        };
        const applied = decision.value.decision === "accept"
          ? await dependencies.canonical_store.applyAdmission({
            outcome: "accept",
            candidate_id: input.candidate_id,
            record,
            decision: decision.value as AdmissionDecisionEnvelopeV1 & { decision: "accept" },
            event: event as never,
            lexical_document: lexicalDocument(record),
            projection_batch: projectionBatch,
          })
          : await dependencies.canonical_store.applyAdmission({
            outcome: "reject",
            candidate_id: input.candidate_id,
            decision: decision.value as AdmissionDecisionEnvelopeV1 & { decision: "reject" },
            event: event as never,
          });
        if (!applied.ok) return operationFailure("request_admission", applied);
        return {
          ok: true,
          value: {
            status: decision.value.decision === "accept" ? "accepted" : "rejected",
            candidate_id: input.candidate_id,
            ...(decision.value.decision === "accept" ? { record_id: record.record_id } : {}),
            cursor: applied.value.cursor,
            decision_receipt_digest: decision.value.receipt_digest,
            transaction_receipt_digest: applied.value.receipt_digest,
          },
        };
      } catch {
        return unavailable("request_admission", "admission dependencies did not return typed results");
      }
    },
    transition: async () => unavailable("reject"),
    recall: async () => unavailable("recall_current"),
    proposeCapitalisation: async () => unavailable("propose_capitalisation"),
    invalidateProjections: async () => unavailable("projection_invalidate"),
    readiness: async () => unavailable("admin"),
  };
}
