import { canonicalizeJcs, normalizeCanonicalJson, type CanonicalJsonValue } from "./canonical-json.js";
import {
  authorizationResourceDigest,
  knowledgePayloadDigest,
  memoryRecordDigest,
  policyEvidenceDigest,
  receiptDigest,
  recordIdFromDigest,
} from "./digests.js";
import { isCanonicalCursor, validateActivityEvidencePage, validateActivityIngestionRequest, validateAdminOperationRequest, validateCandidatePayload, validateProjectionInvalidationRequest, validateReconciliationCommandBinding, validateReconciliationRequest } from "./validation.js";
import { applyProjectionBatchV1 } from "./projection-cascade.js";
import { evaluateReconciliationEligibilityV1, reconciliationProposalIdV1 } from "./assertion-family-registry.js";
import { verifyStoreProvenance } from "./store-factory.js";
import { executeRecall } from "./recall.js";
import type {
  ActivityEvidencePageV1,
  ActivityIngestionItemV1,
  ActivityIngestionReceiptV1,
  AdminEpochReceiptV1,
  AdmissionDecisionEnvelopeV1,
  AdmissionOutcomeV1,
  AdmissionPolicy,
  AdmissionPolicyRequestV1,
  AuthorizationAllowedV1,
  AuthorizationPort,
  AuthorizationRequestV1,
  AuthorizationResultV1,
  CandidatePayloadV2,
  CanonicalMemoryStorePort,
  CapitalisationRequestV1,
  CaptureAcknowledgementV1,
  CaptureRequestV2,
  Cursor,
  Digest,
  MemoryEngineDependenciesV2,
  MemoryErrorCode,
  MemoryOperation,
  MemoryPortV2,
  MemoryRecordV2,
  MemoryState,
  LifecycleCommandV1,
  LifecycleReceiptV1,
  OperationalCapabilityReceiptV1,
  ProjectionBatchV1,
  ProjectionInvalidationReceiptV1,
  ProjectionInvalidationSurfaceV1,
  RecallRequestV2,
  RedactionDirectiveV1,
  RedactionResultV1,
  ReconciliationOutcomeV1,
  ReconciliationProposalV1,
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

function defined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;
}

function compareInstants(left: string, right: string): number {
  return Date.parse(left) - Date.parse(right);
}

/** UTF-8 byte-order comparison (hex-encoded), the record-id order the reconciliation outcome normalizes to. */
function utf8AscendingIds(left: string, right: string): [string, string] {
  return Buffer.from(left, "utf8").toString("hex") < Buffer.from(right, "utf8").toString("hex") ? [left, right] : [right, left];
}

function operationFailure(operation: MemoryOperation, result: Result<never>): Result<never> {
  return result.ok ? result : { ok: false, error: { ...result.error, operation } };
}

/**
 * §5.5(d): a conforming AdminProviderPort declares an authorization denial with `denial: true` (§5.10). The
 * engine maps that flag to code UNAUTHORIZED — mechanically and totally: it does not reclassify a decision it
 * did not make, it only maps the provider-declared boolean to the code. Every other failure surfaces with its
 * own code (clause e), so a non-authorization failure (denial absent) passes through unchanged.
 */
function normalizeAdminDenial(result: Result<AdminEpochReceiptV1>): Result<AdminEpochReceiptV1> {
  return !result.ok && result.error.denial === true
    ? { ok: false, error: { ...result.error, code: "UNAUTHORIZED" } }
    : result;
}

/**
 * §5.5/§5.10: invoke one AdminProviderPort operation so `admin` is TOTAL on its `Result` contract. A provider
 * that throws instead of returning a `Result` surfaces as `POLICY_UNAVAILABLE` (the admin provider is the
 * authority of the authorization epoch, §5.10). Fail-closed: `retryable: false` — the engine cannot know if the
 * fault is transient. Never `UNAUTHORIZED` and never `denial: true` — an exception declared no authorization
 * decision, so mapping it to a denial would re-introduce the inference clause (d) excluded. Never the raw error
 * text — a fixed generic message only (D2 minimal redaction: `String(e)` could leak a credential ref, path, or DSN).
 * This wraps the provider call AND the normalisation of its result; a throw from either — a thrown exception, or
 * a malformed `Result` that fails normalisation — is treated as a provider fault. It does NOT wrap the
 * surrounding engine/fence logic, so an engine bug is never masked as a provider fault.
 */
async function callAdminProvider(call: () => Promise<Result<AdminEpochReceiptV1>>): Promise<Result<AdminEpochReceiptV1>> {
  try {
    return normalizeAdminDenial(await call());
  } catch {
    return refusal("admin", "POLICY_UNAVAILABLE", "admin provider failed");
  }
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
  if (packet === undefined || packet.receipt_digest !== receiptDigestValue || !isInstant(packet.checked_at) || packet.checked_at !== checkedAt
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

// D-8 A (lot X1): stable activity idempotency key over (source_id, sequence, evidence_id) only —
// 73 bytes ("activity:" + 64 hex), inside the 16..256-byte IdempotencyKey bound. evidence_digest is
// excluded on purpose: changed content under the same key is a DIGEST_CONFLICT with no write, not a capture.
function activityIdempotencyKey(sourceId: string, sequence: string, evidenceId: string): string {
  return `activity:${receiptDigest("activity-idempotency", { source_id: sourceId, sequence, evidence_id: evidenceId }).slice("sha256:".length)}`;
}

function captureContentDigest(payloadDigest: Digest, request: CaptureRequestV2): Digest {
  return receiptDigest("capture-content", {
    payload_digest: payloadDigest,
    evidence: request.evidence,
    source_order: request.source_order,
    idempotency_key: request.idempotency_key,
  });
}

// X1 durable idempotence: serialises the (durable pre-check, seal, commit)
// critical section per candidate identity across all ports of this process, so a
// concurrent same-key capture always observes the winner's committed control and
// never seals over it. Entries are released on every path; the map never grows.
const captureReservations = new Map<string, Promise<void>>();

async function withCaptureReservation<T>(candidateId: string, work: () => Promise<T>): Promise<T> {
  const prior = captureReservations.get(candidateId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const chained = prior.then(() => gate);
  captureReservations.set(candidateId, chained);
  await prior.catch(() => undefined);
  try {
    return await work();
  } finally {
    if (captureReservations.get(candidateId) === chained) captureReservations.delete(candidateId);
    release();
  }
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
  const control = optionalExactObject(snapshot.control, ["candidate_id", "envelope_digest", "state", "created_cursor", "policy_id", "policy_version"], ["capture_content_digest", "capture_receipt_digest"]);
  const sealed = exactObject(snapshot.sealed, ["candidate_id", "envelope_ref", "envelope_digest", "key_ref", "ciphertext"]);
  return control !== undefined && sealed !== undefined && control.candidate_id === candidateId && sealed.candidate_id === candidateId
    && control.state === "pending" && isDigest(control.envelope_digest) && control.envelope_digest === sealed.envelope_digest
    && isCanonicalCursor(control.created_cursor) && isOpaque(control.policy_id) && isOpaque(control.policy_version)
    && (!Object.hasOwn(control, "capture_content_digest") || isDigest(control.capture_content_digest))
    && (!Object.hasOwn(control, "capture_receipt_digest") || isDigest(control.capture_receipt_digest))
    && isOpaque(sealed.envelope_ref) && isOpaque(sealed.key_ref) && typeof sealed.ciphertext === "string";
}

function admissionEvent(candidateId: string, record: MemoryRecordV2, authorizationReceipt: Digest, decision: AdmissionDecisionEnvelopeV1) {
  const body = defined({
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
  });
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

function lifecycleCommandIsExact(input: unknown): input is LifecycleCommandV1 {
  const value = normalizeObject(input);
  if (value === undefined || !isOpaque(value.event_id) || !isOpaque(value.reason_ref) || !isInstant(value.deadline_at) || typeof value.operation !== "string") return false;
  const authorization = optionalExactObject(value.authorization, ["credential"], ["context_ref"]);
  const anchor = exactObject(value.event_anchor, ["occurred_at", "kind_ref", "provenance_ref", "provenance_digest"]);
  if (authorization === undefined || typeof authorization.credential !== "string" || (Object.hasOwn(authorization, "context_ref") && !isOpaque(authorization.context_ref))
    || anchor === undefined || !isInstant(anchor.occurred_at) || !isOpaque(anchor.kind_ref) || !isOpaque(anchor.provenance_ref) || !isDigest(anchor.provenance_digest)) return false;
  const common = ["operation", "event_id", "reason_ref", "event_anchor", "authorization", "deadline_at"];
  const candidate = ["reject", "withdraw"];
  const singleRecord = ["dispute", "resolve_dispute", "expire", "mark_non_current", "trust_invalidate", "tombstone"];
  const related = ["supersede", "rewind"];
  const reconcilable = ["dispute", "resolve_dispute", "supersede"];
  const keys = Object.keys(value);
  if (candidate.includes(value.operation)) {
    return keys.length === common.length + 1 && keys.every((key) => common.includes(key) || key === "candidate_id") && isOpaque(value.candidate_id);
  }
  if (singleRecord.includes(value.operation)) {
    const allowsBinding = reconcilable.includes(value.operation);
    if (!keys.every((key) => common.includes(key) || key === "record_id" || key === "valid_effective_at" || (allowsBinding && key === "reconciliation"))) return false;
    if (!isOpaque(value.record_id)) return false;
    if (Object.hasOwn(value, "valid_effective_at") && !(typeof value.valid_effective_at === "number" && Number.isSafeInteger(value.valid_effective_at))) return false;
    if (Object.hasOwn(value, "reconciliation") && validateReconciliationCommandBinding(value.reconciliation).ok === false) return false;
    return true;
  }
  if (related.includes(value.operation)) {
    const allowsBinding = reconcilable.includes(value.operation);
    if (!keys.every((key) => common.includes(key) || key === "record_id" || key === "related_record_id" || key === "valid_effective_at" || (allowsBinding && key === "reconciliation"))) return false;
    if (!isOpaque(value.record_id) || !isOpaque(value.related_record_id)) return false;
    if (Object.hasOwn(value, "valid_effective_at") && !(typeof value.valid_effective_at === "number" && Number.isSafeInteger(value.valid_effective_at))) return false;
    if (Object.hasOwn(value, "reconciliation") && validateReconciliationCommandBinding(value.reconciliation).ok === false) return false;
    return true;
  }
  return false;
}

function lifecycleTarget(operation: LifecycleCommandV1["operation"]): MemoryState {
  if (operation === "reject") return "rejected";
  if (operation === "withdraw") return "withdrawn";
  if (operation === "dispute") return "accepted_disputed";
  if (operation === "resolve_dispute" || operation === "rewind") return "accepted_current";
  if (operation === "supersede" || operation === "mark_non_current") return "historical";
  if (operation === "expire") return "expired";
  if (operation === "trust_invalidate") return "trust_invalid";
  return "tombstoned";
}

function lifecycleAuthorizationOperation(operation: LifecycleCommandV1["operation"]): MemoryOperation {
  return operation === "dispute" || operation === "resolve_dispute" ? "mark_non_current" : operation;
}

function lifecycleEvent(command: LifecycleCommandV1, now: string, fromState: MemoryState | undefined, authorizationReceipt: Digest, recalculated?: { proposal: ReconciliationProposalV1; registry_id: string; registry_version: string }) {
  const binding = recalculated !== undefined
    ? {
      proposal_id: recalculated.proposal.proposal_id,
      proposal_digest: recalculated.proposal.proposal_digest,
      family_id: recalculated.proposal.family_id,
      family_version: recalculated.proposal.family_version,
      registry_id: recalculated.registry_id,
      registry_version: recalculated.registry_version,
    }
    : undefined;
  const body = defined({
    schema_version: 2 as const,
    event_id: command.event_id,
    cursor: "0",
    recorded_at: now,
    operation: command.operation,
    candidate_id: "candidate_id" in command ? command.candidate_id : undefined,
    record_id: "record_id" in command ? command.record_id : undefined,
    related_record_id: "related_record_id" in command ? command.related_record_id : undefined,
    from_state: fromState,
    to_state: lifecycleTarget(command.operation),
    valid_effective_at: "valid_effective_at" in command ? command.valid_effective_at : undefined,
    authorization_receipt_digest: authorizationReceipt,
    reason_ref: command.reason_ref,
    event_anchor: command.event_anchor,
    reconciliation: binding,
    previous_event_digest: ZERO_DIGEST,
  });
  return { ...body, event_digest: receiptDigest("event", body) };
}

function lifecycleProjectionBatch(command: LifecycleCommandV1): ProjectionBatchV1 {
  const recordId = "record_id" in command ? command.record_id : undefined;
  const body = {
    from_cursor_exclusive: "0",
    through_cursor_inclusive: "0",
    records: [],
    removals: recordId === undefined ? [] : [{ record_id: recordId, reason_ref: command.reason_ref }],
  };
  return { ...body, batch_digest: receiptDigest("projection-batch", body) };
}

async function foldedStateForCommand(dependencies: MemoryEngineDependenciesV2, command: LifecycleCommandV1): Promise<Result<MemoryState | undefined>> {
  try {
    const journal = await dependencies.canonical_store.readJournal({ after: "0", limit: 2_000 });
    if (!journal.ok) return operationFailure(command.operation, journal);
    const targetId = "record_id" in command ? command.record_id : command.candidate_id;
    let state: MemoryState | undefined;
    for (const event of journal.value) {
      if (("record_id" in command && event.record_id === targetId) || ("candidate_id" in command && event.candidate_id === targetId)) state = event.to_state;
    }
    return { ok: true, value: state };
  } catch {
    return unavailable(command.operation, "canonical store did not return a journal");
  }
}

/**
 * T5.8 binding validation, before any cursor allocation. Recomputes the outcome
 * for the bound proposal's family, version, pair and pin through T5.7 steps 5–7
 * with `propose_reconciliation` authorized on both records, then checks the
 * command matches the proposal. Fold and replay never call this: they read the
 * stored event binding only.
 */
async function validateReconciliationBindingForTransition(
  dependencies: MemoryEngineDependenciesV2,
  command: LifecycleCommandV1,
  now: string,
): Promise<Result<{ proposal: ReconciliationProposalV1; registry_id: string; registry_version: string } | undefined>> {
  if (!("reconciliation" in command) || command.reconciliation === undefined) return { ok: true, value: undefined };
  if (command.operation !== "dispute" && command.operation !== "resolve_dispute" && command.operation !== "supersede") {
    return refusal(command.operation, "INVALID_SCHEMA", "reconciliation binding is allowed only on dispute, resolve_dispute and supersede");
  }
  const checked = validateReconciliationCommandBinding(command.reconciliation);
  if (!checked.ok) return { ok: false, error: { ...checked.error, operation: command.operation } };
  const binding = checked.value;
  const proposal = binding.proposal;
  const registry = dependencies.assertion_registry;
  if (registry === undefined || registry.registry_id !== binding.registry_id || registry.registry_version !== binding.registry_version) {
    return refusal(command.operation, "REGISTRY_VERSION_UNAVAILABLE", "bound assertion registry version is not installed");
  }
  if (!registry.descriptors().some((descriptor) => descriptor.family_id === proposal.family_id && descriptor.version === proposal.family_version)) {
    return refusal(command.operation, "REGISTRY_VERSION_UNAVAILABLE", "bound assertion family version is not installed");
  }
  const pin = proposal.comparison_system_as_of;
  if (!isCanonicalCursor(pin)) return refusal(command.operation, "INVALID_DIGEST", "bound comparison cursor is invalid");
  const [leftId, rightId] = utf8AscendingIds(proposal.left_record_id, proposal.right_record_id);
  if (leftId !== proposal.left_record_id || rightId !== proposal.right_record_id) {
    return refusal(command.operation, "INVALID_DIGEST", "bound proposal pair is not in UTF-8 ascending order");
  }
  const records = new Map<string, MemoryRecordV2>();
  const eligible = new Map<string, boolean>();
  for (const recordId of [leftId, rightId]) {
    const resource = { record_id: recordId };
    let authorization: Awaited<ReturnType<typeof authorizeOperation>>;
    try {
      authorization = await authorizeOperation(dependencies.authorization, {
        operation: "propose_reconciliation",
        resource,
        resource_digest: authorizationResourceDigest("propose_reconciliation", resource),
        context: command.authorization,
        issued_at: now,
        deadline_at: command.deadline_at,
      }, undefined, now);
    } catch {
      return unavailable(command.operation, "authorization port did not return a typed result");
    }
    if (!authorization.ok) return { ok: false, error: { ...authorization.error, operation: command.operation } };
    let read: Awaited<ReturnType<MemoryEngineDependenciesV2["canonical_store"]["readRecord"]>>;
    try {
      read = await dependencies.canonical_store.readRecord({
        record_id: recordId,
        system_as_of: pin,
        authorization_receipt_digest: authorization.value.receipt_digest,
      });
    } catch {
      return unavailable(command.operation, "canonical store did not return a typed record");
    }
    if (!read.ok) return refusal(command.operation, "INVALID_DIGEST", "bound proposal pair is not readable at its comparison cursor");
    if (read.value.scope_ref !== authorization.value.scope_ref) return refusal(command.operation, "UNAUTHORIZED", "authorization scope does not bind the reconciliation record");
    let revalidated: Awaited<ReturnType<MemoryEngineDependenciesV2["canonical_store"]["revalidateReadOnly"]>>;
    try {
      revalidated = await dependencies.canonical_store.revalidateReadOnly({
        record_ids: [recordId],
        valid_as_of: read.value.valid_time.t,
        system_as_of: pin,
        authorization_receipt_digest: authorization.value.receipt_digest,
        operation: "recall_current",
      });
    } catch {
      return unavailable(command.operation, "canonical store did not return typed reconciliation results");
    }
    if (!revalidated.ok) return refusal(command.operation, "INVALID_DIGEST", "bound proposal pair is not eligible at its comparison cursor");
    records.set(recordId, read.value);
    eligible.set(recordId, revalidated.value.eligible_record_ids.includes(recordId));
  }
  if (eligible.get(leftId) !== true || eligible.get(rightId) !== true) {
    return refusal(command.operation, "INVALID_DIGEST", "bound proposal pair is not eligible");
  }
  const left = records.get(leftId)!;
  const right = records.get(rightId)!;
  const gate = evaluateReconciliationEligibilityV1(
    { family_id: proposal.family_id, family_version: proposal.family_version, left, right, comparison_system_as_of: pin },
    {
      left: { record_id: left.record_id, state: "accepted_current", unexpired: true, dependency_eligible: true },
      right: { record_id: right.record_id, state: "accepted_current", unexpired: true, dependency_eligible: true },
    },
  );
  if (!gate.ok) return refusal(command.operation, "INVALID_DIGEST", "bound proposal pair fails the eligibility gate");
  let compared: ReturnType<typeof registry.compare>;
  try {
    compared = registry.compare({ family_id: proposal.family_id, family_version: proposal.family_version, left, right, comparison_system_as_of: pin });
  } catch {
    return unavailable(command.operation, "assertion registry did not return a typed proposal");
  }
  if (!compared.ok) return refusal(command.operation, "INVALID_DIGEST", "bound proposal does not recompute");
  const recomputed = compared.value;
  if (recomputed === undefined) return refusal(command.operation, "INVALID_DIGEST", "bound proposal does not recompute");
  const { proposal_digest: suppliedDigest, ...suppliedBody } = proposal;
  if (receiptDigest("reconciliation-proposal", suppliedBody as Record<string, unknown>, "proposal_digest") !== suppliedDigest) {
    return refusal(command.operation, "INVALID_DIGEST", "bound proposal digest does not bind the supplied proposal body");
  }
  if (reconciliationProposalIdV1({
    family_id: proposal.family_id,
    family_version: proposal.family_version,
    occurrence_key: proposal.occurrence_key,
    left_record_id: proposal.left_record_id,
    right_record_id: proposal.right_record_id,
    relation: proposal.relation,
    comparison_system_as_of: proposal.comparison_system_as_of,
  }) !== proposal.proposal_id) {
    return refusal(command.operation, "INVALID_DIGEST", "bound proposal id does not bind the supplied proposal body");
  }
  const evidenceMatches = proposal.evidence_citation_ids.length === recomputed.evidence_citation_ids.length
    && proposal.evidence_citation_ids.every((citation, index) => citation === recomputed.evidence_citation_ids[index]);
  if (proposal.proposal_id !== recomputed.proposal_id
    || proposal.family_id !== recomputed.family_id
    || proposal.family_version !== recomputed.family_version
    || proposal.occurrence_key !== recomputed.occurrence_key
    || proposal.left_record_id !== recomputed.left_record_id
    || proposal.right_record_id !== recomputed.right_record_id
    || proposal.relation !== recomputed.relation
    || proposal.comparison_system_as_of !== recomputed.comparison_system_as_of
    || proposal.proposal_digest !== recomputed.proposal_digest
    || !evidenceMatches) {
    return refusal(command.operation, "INVALID_DIGEST", "bound proposal does not match the recomputed outcome");
  }
  const recalculated = { proposal: recomputed, registry_id: binding.registry_id, registry_version: binding.registry_version };
  const pair = new Set([recomputed.left_record_id, recomputed.right_record_id]);
  if (command.operation === "supersede") {
    if (!pair.has(command.record_id) || !pair.has(command.related_record_id) || command.record_id === command.related_record_id) {
      return refusal(command.operation, "ILLEGAL_TRANSITION", "bound command record ids are outside the proposal pair");
    }
    if (recomputed.relation === "left_supersedes_right") {
      if (command.record_id !== recomputed.right_record_id || command.related_record_id !== recomputed.left_record_id) {
        return refusal(command.operation, "ILLEGAL_TRANSITION", "supersede direction does not match the bound proposal");
      }
      return { ok: true, value: recalculated };
    }
    if (recomputed.relation === "right_supersedes_left") {
      if (command.record_id !== recomputed.left_record_id || command.related_record_id !== recomputed.right_record_id) {
        return refusal(command.operation, "ILLEGAL_TRANSITION", "supersede direction does not match the bound proposal");
      }
      return { ok: true, value: recalculated };
    }
    return refusal(command.operation, "ILLEGAL_TRANSITION", "supersede requires a directional bound proposal");
  }
  if (!pair.has(command.record_id)) {
    return refusal(command.operation, "ILLEGAL_TRANSITION", "bound command record is outside the proposal pair");
  }
  return { ok: true, value: recalculated };
}

export function validateRecallRequest(input: unknown, now: string): Result<RecallRequestV2> {
  const value = normalizeObject(input);
  const request = optionalExactObject(value, ["query", "purpose_ref", "authorization", "capability_policy", "budgets"], ["as_of", "page"]);
  if (request === undefined || typeof request.query !== "string") return refusal("recall_current", "INVALID_SCHEMA", "recall request is not exact");
  const queryBytes = new TextEncoder().encode(request.query).byteLength;
  if (queryBytes < 1 || queryBytes > 8192 || !isOpaque(request.purpose_ref)) return refusal("recall_current", "INVALID_SCHEMA", "recall query or purpose is out of bounds");
  const authorization = optionalExactObject(request.authorization, ["credential"], ["context_ref"]);
  const policy = exactObject(request.capability_policy, ["minimum_channels", "network"]);
  const budgets = exactObject(request.budgets, ["max_candidates", "max_results", "max_packet_bytes", "deadline_at"]);
  if (authorization === undefined || typeof authorization.credential !== "string" || (Object.hasOwn(authorization, "context_ref") && !isOpaque(authorization.context_ref))
    || policy === undefined || !["lexical", "lexical_and_semantic"].includes(String(policy.minimum_channels)) || !["forbid", "allow"].includes(String(policy.network))
    || budgets === undefined) return refusal("recall_current", "INVALID_SCHEMA", "recall carriers are invalid");
  const inRange = (candidate: unknown, min: number, max: number) => typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate >= min && candidate <= max;
  if (!inRange(budgets.max_candidates, 1, 2000) || !inRange(budgets.max_results, 1, 100) || !inRange(budgets.max_packet_bytes, 1, 1_048_576) || !isInstant(budgets.deadline_at)) {
    return refusal("recall_current", "INVALID_SCHEMA", "recall budgets are out of bounds");
  }
  if (compareInstants(now, budgets.deadline_at as string) >= 0) return refusal("recall_current", "DEADLINE_EXCEEDED", "recall deadline elapsed before ranking");
  if (Object.hasOwn(request, "as_of")) {
    const asOf = optionalExactObject(request.as_of, [], ["valid_time", "system_cursor"]);
    if (asOf === undefined || (Object.hasOwn(asOf, "valid_time") && !Number.isSafeInteger(asOf.valid_time)) || (Object.hasOwn(asOf, "system_cursor") && !isCanonicalCursor(asOf.system_cursor))) {
      return refusal("recall_current", "INVALID_SCHEMA", "recall as_of carrier is invalid");
    }
  }
  if (Object.hasOwn(request, "page")) {
    const page = optionalExactObject(request.page, ["size"], ["cursor"]);
    if (page === undefined || !inRange(page.size, 1, 50) || (Object.hasOwn(page, "cursor") && !isOpaque(page.cursor))) {
      return refusal("recall_current", "INVALID_SCHEMA", "recall page carrier is invalid");
    }
  }
  return { ok: true, value: request as unknown as RecallRequestV2 };
}

function validateCapitalisationRequest(input: unknown, now: string): Result<CapitalisationRequestV1> {
  const value = normalizeObject(input);
  const request = exactObject(value, ["idempotency_key", "source_record_id", "target_scope_ref", "purpose_ref", "retention", "authorization", "deadline_at"]);
  if (request === undefined || !isOpaque(request.idempotency_key) || new TextEncoder().encode(request.idempotency_key as string).byteLength < 16
    || !isOpaque(request.source_record_id) || !isOpaque(request.target_scope_ref) || !isOpaque(request.purpose_ref) || !isInstant(request.deadline_at)) {
    return refusal("propose_capitalisation", "INVALID_SCHEMA", "capitalisation request is not exact");
  }
  const retention = optionalExactObject(request.retention, ["derivative_rule"], ["expires_at"]);
  const authorization = optionalExactObject(request.authorization, ["credential"], ["context_ref"]);
  if (retention === undefined || !["retain", "make-ineligible"].includes(String(retention.derivative_rule)) || (Object.hasOwn(retention, "expires_at") && !isInstant(retention.expires_at))
    || authorization === undefined || typeof authorization.credential !== "string" || (Object.hasOwn(authorization, "context_ref") && !isOpaque(authorization.context_ref))) {
    return refusal("propose_capitalisation", "INVALID_SCHEMA", "capitalisation carriers are invalid");
  }
  if (compareInstants(now, request.deadline_at as string) >= 0) return refusal("propose_capitalisation", "DEADLINE_EXCEEDED", "capitalisation deadline elapsed before commit");
  return { ok: true, value: request as unknown as CapitalisationRequestV1 };
}

function validateRedactionResult(input: unknown): RedactionResultV1 | undefined {
  const value = normalizeObject(input);
  const result = exactObject(value, ["payload", "source_record_digest", "output_payload_digest", "policy_version", "receipt_digest"]);
  if (result === undefined || !isDigest(result.source_record_digest) || !isDigest(result.output_payload_digest) || !isOpaque(result.policy_version) || !isDigest(result.receipt_digest)) return undefined;
  return result as unknown as RedactionResultV1;
}

/** L2 coordination only: it validates/seals pending capture and delegates durability to the canonical store. */
export function createMemoryPortV2(dependencies: MemoryEngineDependenciesV2): MemoryPortV2 {
  const cancelled = new Set<string>();
  const capturedContent = new Map<string, Digest>();
  const admissionOutcomes = new Map<string, AdmissionOutcomeV1>();
  // X2 tour 4 (MAJEUR-1, normative §4): at most one invalidateProjections cascade runs at a time per port.
  // Overlapping calls queue on this chain instead of interleaving rounds: a stale batch read by an older
  // call can never apply after a newer call certified past a tombstone. A rejected call still releases
  // the chain for the next waiter.
  let projectionChain: Promise<unknown> = Promise.resolve();
  const unfencedMemoryStorePermitted = dependencies.allow_unfenced_memory_store === true;
  // §5.9 (v5-c): announce the non-production posture once at construction so a host can log/audit it at startup.
  if (unfencedMemoryStorePermitted) dependencies.on_unfenced_memory_store_permitted?.();

  // §5.9: obtain a FRESH readiness receipt and verify the store's PROVENANCE (in-process factory mark + declared-
  // identity lockstep, verifyStoreProvenance) BEFORE admitting any fencing-dependent operation. The check runs in
  // the engine, never delegated to the store's own readiness(). Called once PER OP on purpose — the receipt must
  // be fresh (§5.9 l.1041/1047), so the result is deliberately NOT memoised across operations; do not add a cache.
  const admitFenced = async (operation: MemoryOperation): Promise<Result<OperationalCapabilityReceiptV1>> => {
    let readiness: Result<OperationalCapabilityReceiptV1>;
    try {
      readiness = await dependencies.canonical_store.readiness();
    } catch {
      return unavailable(operation, "canonical store did not return a readiness receipt");
    }
    if (!readiness.ok) return operationFailure(operation, readiness);
    // §5.9: admit only via the in-process mark — a store built by this module's fenced factory (production), or
    // this module's neutral in-memory store when the host raised `allow_unfenced_memory_store` (non-production).
    // The receipt's `backend` string is never consulted; production fails closed. verifyStoreProvenance decides.
    return verifyStoreProvenance(dependencies.canonical_store, readiness.value, { allowUnfencedMemoryStore: dependencies.allow_unfenced_memory_store === true }, operation);
  };

  const port: MemoryPortV2 = {
    version: 2,
    capabilities: async () => {
      try {
        const readiness = await dependencies.canonical_store.readiness();
        if (!readiness.ok) return operationFailure("admin", readiness);
        const backend = readiness.value.backend;
        if (backend !== "sqlite" && backend !== "postgres") return unavailable("admin", "canonical backend does not support the published capability descriptor");
        // NOTE (§5.9): capabilities() is a REPORTING surface, not a fencing-dependent operation (§5.9 l.1041
        // gates "operations that require fencing"), so it is deliberately NOT attestation-gated — a refused
        // caller must still be able to read the descriptor (which reports fenced_single_writer) to diagnose why.
        const semantic = dependencies.semantic_projection !== undefined && dependencies.vector_projection !== undefined;
        const body = {
          contract_version: 2 as const,
          profiles: (semantic ? ["offline_lexical_v1", "semantic_v1"] : ["offline_lexical_v1"]) as ReadonlyArray<"offline_lexical_v1" | "semantic_v1">,
          canonical_backends: [backend] as ReadonlyArray<"sqlite" | "postgres">,
          max_candidates: 2000 as const,
          max_results: 100 as const,
          // §5.9: surface the fence-bypass postures; true on a sqlite/postgres descriptor is a prod misconfiguration.
          unfenced_memory_store_permitted: unfencedMemoryStorePermitted,
          ephemeral_filesystem_store_permitted: readiness.value.capabilities.ephemeral_filesystem_store_permitted === true,
        };
        return { ok: true, value: { ...body, receipt_digest: receiptDigest("capability-descriptor", body) } };
      } catch {
        return unavailable("admin", "canonical store did not return a readiness receipt");
      }
    },
    validate: (payload) => {
      const validated = validateCandidatePayload(payload);
      return validated.ok ? { ok: true, value: { payload_digest: validated.value.payload_digest } } : operationFailure("capture", validated);
    },
    capture: async (input): Promise<Result<CaptureAcknowledgementV1>> => {
      const admitted = await admitFenced("capture");
      if (!admitted.ok) return admitted;
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
        return await withCaptureReservation(candidateId, async () => {
          // This read is authoritative across every lifecycle state and port
          // restart. Only NOT_FOUND permits a first capture; a read failure
          // must never fall through to sealing over previously stored data.
          const reader = dependencies.canonical_store.readCaptureIdempotency;
          if (reader !== undefined) {
            const seen = await reader.call(dependencies.canonical_store, { candidate_id: candidateId });
            if (!seen.ok && seen.error.code !== "NOT_FOUND") return operationFailure("capture", seen);
            if (seen.ok) {
              const registered = seen.value;
              if (registered.capture_content_digest !== contentDigest) {
                return refusal("capture", "DIGEST_CONFLICT", "idempotency identity is already bound to different capture content");
              }
              if (!isCanonicalCursor(registered.created_cursor) || !isDigest(registered.capture_receipt_digest)) {
                return refusal("capture", "JOURNAL_CORRUPT", "capture idempotency acknowledgement is incomplete");
              }
              // record_digest is optional on CaptureAcknowledgementV1. A crash
              // between commit and its supplementary recording never permits
              // another write, including after the pending key is destroyed.
              capturedContent.set(candidateId, contentDigest);
              return { ok: true, value: {
                status: "duplicate_exact", candidate_id: candidateId,
                cursor: registered.created_cursor,
                ...(registered.record_digest === undefined ? {} : { record_digest: registered.record_digest }),
                transaction_receipt_digest: registered.capture_receipt_digest,
              } };
            }
          }
          if (cancelled.has(request.cancellation_ref)) return refusal("capture", "CANCELLED", "capture was cancelled before commit");
          const sealed = await dependencies.crypto.seal({
            candidate_id: candidateId,
            plaintext: canonicalizeJcs(pendingEnvelope(payload, request, authorization.value.receipt_digest, trust.value, now)),
            context_digest: pendingContextDigest(candidateId),
          });
          if (!sealed.ok) return operationFailure("capture", sealed);
          const committed = await dependencies.canonical_store.commitPending({
            control: {
              candidate_id: candidateId, envelope_digest: sealed.value.envelope_digest,
              state: "pending", created_cursor: "0",
              policy_id: dependencies.admission_policy.policy_id,
              policy_version: dependencies.admission_policy.policy_version,
              capture_content_digest: contentDigest,
            },
            sealed: sealed.value,
            capture_event: captureEvent(request, candidateId, authorization.value.receipt_digest, now),
          });
          if (!committed.ok) return operationFailure("capture", committed);
          // Preserve the V1 direct receipt contract. Some legacy stores also
          // report an outcome; X1's built-in stores decide replays above.
          const receipt = committed.value as typeof committed.value & { outcome?: "committed_pending" | "duplicate_exact" };
          if (!isCanonicalCursor(receipt.cursor) || !isInstant(receipt.committed_at)) return refusal("capture", "INVALID_SCHEMA", "pending commit did not return a durable receipt");
          capturedContent.set(candidateId, contentDigest);
          const record = recordForPending(payload, payload_digest, authorization.value.receipt_digest, trust.value, now, receipt.cursor);
          // Supplementary acknowledgement metadata only: content, original
          // cursor and fenced receipt are already durable in commitPending.
          // An interrupted completion cannot weaken replay or conflict checks.
          try {
            await dependencies.canonical_store.recordCaptureIdempotency?.({ candidate_id: candidateId, record_digest: record.record_digest });
          } catch { /* replay remains a pure read of the committed registry */ }
          return { ok: true, value: {
            status: receipt.outcome === "duplicate_exact" ? "duplicate_exact" : "committed_pending",
            candidate_id: candidateId, record_digest: record.record_digest,
            cursor: receipt.cursor, transaction_receipt_digest: receipt.receipt_digest,
          } };
        });
      } catch {
        return unavailable("capture", "capture dependencies did not return typed results");
      }
    },
    // D-8 A (lot X1): host-invoked pull of one activity page. Each item becomes an ordinary pending
    // capture through port.capture (fencing, authorization, trust classification and idempotency
    // unchanged); the source can never admit — items stay pending until requestAdmission.
    ingestActivity: async (input): Promise<Result<ActivityIngestionReceiptV1>> => {
      const admitted = await admitFenced("capture");
      if (!admitted.ok) return admitted;
      const now = dependencies.clock?.now();
      if (!isInstant(now)) return unavailable("capture", "clock did not supply a canonical instant");
      const checked = validateActivityIngestionRequest(input);
      if (!checked.ok) return checked;
      const request = checked.value;
      if (compareInstants(now, request.deadline_at) >= 0) return refusal("capture", "DEADLINE_EXCEEDED", "activity ingestion deadline elapsed before the source read");
      const source = dependencies.activity_sources.find((entry) => entry.source_id === request.source_id);
      if (source === undefined) return unavailable("capture", "unknown activity source");
      if (dependencies.canonical_store.readCaptureIdempotency === undefined) return unavailable("capture", "activity ingestion requires durable capture idempotency");
      let page: ActivityEvidencePageV1;
      try {
        const read = await source.read({
          ...(request.after === undefined ? {} : { after: request.after }),
          limit: request.limit,
          ...(request.valid_window === undefined ? {} : { valid_window: request.valid_window }),
          deadline_at: request.deadline_at,
          cancellation_ref: request.cancellation_ref,
        });
        if (!read.ok) return operationFailure("capture", read);
        if (read.value.source_id !== request.source_id) return refusal("capture", "INVALID_SCHEMA", "activity page names a different source");
        const pageChecked = validateActivityEvidencePage(read.value);
        if (!pageChecked.ok) return pageChecked;
        page = pageChecked.value;
      } catch {
        return unavailable("capture", "activity source did not return a typed page");
      }
      const items: ActivityIngestionItemV1[] = [];
      for (const evidence of page.evidence) {
        const captured = await port.capture({
          schema_version: 2,
          idempotency_key: activityIdempotencyKey(request.source_id, evidence.sequence, evidence.evidence_id),
          payload: {
            schema_version: 2,
            scope_ref: request.scope_ref,
            purpose_ref: request.purpose_ref,
            valid_time: evidence.valid_time,
            components: evidence.components,
            primary_component_id: evidence.primary_component_id,
            primary_event: evidence.primary_event,
            citations: evidence.citations,
            retention: request.retention,
            reconciliation: request.reconciliation,
          },
          evidence: {
            evidence_ref: evidence.evidence_id,
            evidence_digest: evidence.evidence_digest,
            citation_ids: evidence.citations.map((citation) => citation.citation_id).sort(),
          },
          authorization: request.authorization,
          source_order: { source_ref: request.source_id, sequence: evidence.sequence },
          deadline_at: request.deadline_at,
          cancellation_ref: request.cancellation_ref,
        });
        // The first failing capture stops the page; earlier items are durable and idempotent, so the
        // host retries from the same after. Errors already carry the capture operation.
        if (!captured.ok) return captured;
        const acknowledgement = captured.value;
        if (acknowledgement.candidate_id === undefined || acknowledgement.cursor === undefined) {
          return refusal("capture", "INVALID_SCHEMA", "ingested capture did not return a durable acknowledgement");
        }
        items.push({
          evidence_id: evidence.evidence_id,
          sequence: evidence.sequence,
          status: acknowledgement.status === "duplicate_exact" ? "duplicate_exact" : "committed_pending",
          candidate_id: acknowledgement.candidate_id,
          cursor: acknowledgement.cursor,
        });
      }
      const body = defined({
        source_id: request.source_id,
        source_version: page.source_version,
        page_digest: page.page_digest,
        next_after: page.next_after,
        items,
      });
      return { ok: true, value: { ...body, receipt_digest: receiptDigest("activity-ingestion", body) } };
    },
    cancelCapture: async (cancellationRef) => {
      cancelled.add(cancellationRef);
      return { ok: true, value: { cancelled: true } };
    },
    requestAdmission: async (input) => {
      const admitted = await admitFenced("request_admission");
      if (!admitted.ok) return admitted;
      if (!admissionRequestIsExact(input)) return refusal("request_admission", "INVALID_SCHEMA", "admission request is not exact");
      const now = dependencies.clock?.now();
      if (!isInstant(now)) return unavailable("request_admission", "clock did not supply a canonical instant");
      if (Date.parse(now) >= Date.parse(input.deadline_at)) return refusal("request_admission", "DEADLINE_EXCEEDED", "admission deadline elapsed before decision");
      const previousOutcome = admissionOutcomes.get(input.candidate_id);
      if (previousOutcome !== undefined) return { ok: true, value: previousOutcome };
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
        const value: AdmissionOutcomeV1 = {
          status: decision.value.decision === "accept" ? "accepted" : "rejected",
          candidate_id: input.candidate_id,
          ...(decision.value.decision === "accept" ? { record_id: record.record_id } : {}),
          cursor: applied.value.cursor,
          decision_receipt_digest: decision.value.receipt_digest,
          transaction_receipt_digest: applied.value.receipt_digest,
        };
        const destroyed = await dependencies.crypto.destroy({ key_ref: pending.value.sealed.key_ref, idempotency_key: `destroy:${input.candidate_id}` });
        if (!destroyed.ok) return operationFailure("request_admission", destroyed);
        admissionOutcomes.set(input.candidate_id, value);
        return { ok: true, value };
      } catch {
        return unavailable("request_admission", "admission dependencies did not return typed results");
      }
    },
    transition: async (input): Promise<Result<LifecycleReceiptV1>> => {
      if (!lifecycleCommandIsExact(input)) return refusal("reject", "INVALID_SCHEMA", "lifecycle command is not exact");
      const now = dependencies.clock?.now();
      if (!isInstant(now)) return unavailable(input.operation, "clock did not supply a canonical instant");
      if (Date.parse(now) >= Date.parse(input.deadline_at)) return refusal(input.operation, "DEADLINE_EXCEEDED", "lifecycle deadline elapsed before transition");
      const admitted = await admitFenced(input.operation);
      if (!admitted.ok) return admitted;
      const bound = await validateReconciliationBindingForTransition(dependencies, input, now);
      if (!bound.ok) return bound;
      const authorizationOperation = lifecycleAuthorizationOperation(input.operation);
      const resource = "record_id" in input ? { record_id: input.record_id } : { candidate_id: input.candidate_id };
      const authorization = await authorizeOperation(dependencies.authorization, {
        operation: authorizationOperation,
        resource,
        resource_digest: authorizationResourceDigest(authorizationOperation, resource),
        context: input.authorization,
        issued_at: now,
        deadline_at: input.deadline_at,
      }, undefined, now);
      if (!authorization.ok) return { ok: false, error: { ...authorization.error, operation: input.operation } };
      if ("record_id" in input) {
        try {
          const record = await dependencies.canonical_store.readRecord({
            record_id: input.record_id,
            system_as_of: admitted.value.high_water_cursor,
            authorization_receipt_digest: authorization.value.receipt_digest,
          });
          if (!record.ok) return operationFailure(input.operation, record);
          if (record.value.scope_ref !== authorization.value.scope_ref) return refusal(input.operation, "UNAUTHORIZED", "authorization scope does not bind the lifecycle record");
        } catch {
          return unavailable(input.operation, "canonical store did not return a typed record");
        }
      }
      const fromState = await foldedStateForCommand(dependencies, input);
      if (!fromState.ok) return fromState;
      const event = lifecycleEvent(input, now, fromState.value, authorization.value.receipt_digest, bound.value ?? undefined);
      const applied = await dependencies.canonical_store.applyLifecycle({
        command: input,
        event: event as never,
        projection_batch: lifecycleProjectionBatch(input),
      });
      if (!applied.ok) return operationFailure(input.operation, applied);
      return {
        ok: true,
        value: {
          event_id: input.event_id,
          operation: input.operation,
          from_state: fromState.value ?? ("candidate_id" in input ? "pending" : lifecycleTarget(input.operation)),
          to_state: lifecycleTarget(input.operation),
          cursor: applied.value.cursor,
          event_digest: applied.value.event_digest,
          authorization_receipt_digest: authorization.value.receipt_digest,
          transaction_receipt_digest: applied.value.receipt_digest,
        },
      };
    },
    recall: async (input) => {
      const admitted = await admitFenced("recall_current");
      if (!admitted.ok) return admitted;
      const now = dependencies.clock?.now();
      if (!isInstant(now)) return unavailable("recall_current", "clock did not supply a canonical instant");
      const validated = validateRecallRequest(input, now);
      if (!validated.ok) return validated;
      const request = validated.value;
      const resource = {};
      const authorization = await authorizeOperation(dependencies.authorization, {
        operation: "recall_current",
        resource,
        resource_digest: authorizationResourceDigest("recall_current", resource),
        context: request.authorization,
        issued_at: now,
        deadline_at: request.budgets.deadline_at,
      }, undefined, now);
      if (!authorization.ok) return authorization;
      return executeRecall(dependencies, { request, authorization: authorization.value, now });
    },
    proposeCapitalisation: async (input): Promise<Result<CaptureAcknowledgementV1>> => {
      const admitted = await admitFenced("propose_capitalisation");
      if (!admitted.ok) return admitted;
      const now = dependencies.clock?.now();
      if (!isInstant(now)) return unavailable("propose_capitalisation", "clock did not supply a canonical instant");
      const validated = validateCapitalisationRequest(input, now);
      if (!validated.ok) return validated;
      const request = validated.value;
      // Authorize the source read independently of the target capture (SPEC §5.5).
      const sourceResource = { record_id: request.source_record_id };
      const sourceAuthorization = await authorizeOperation(dependencies.authorization, {
        operation: "recall_current",
        resource: sourceResource,
        resource_digest: authorizationResourceDigest("recall_current", sourceResource),
        context: request.authorization,
        issued_at: now,
        deadline_at: request.deadline_at,
      }, undefined, now);
      if (!sourceAuthorization.ok) return operationFailure("propose_capitalisation", sourceAuthorization as Result<never>);
      let sourceRecord: MemoryRecordV2;
      try {
        const read = await dependencies.canonical_store.readRecord({
          record_id: request.source_record_id,
          system_as_of: admitted.value.high_water_cursor,
          authorization_receipt_digest: sourceAuthorization.value.receipt_digest,
        });
        if (!read.ok) return operationFailure("propose_capitalisation", read);
        if (read.value.scope_ref !== sourceAuthorization.value.scope_ref) return refusal("propose_capitalisation", "UNAUTHORIZED", "authorization scope does not bind the source record");
        sourceRecord = read.value;
      } catch {
        return unavailable("propose_capitalisation", "canonical store did not return a typed source record");
      }
      if (sourceRecord.scope_ref === request.target_scope_ref) return refusal("propose_capitalisation", "ILLEGAL_TRANSITION", "capitalisation must target a different scope");
      // Authorize the target capture and obtain the port-owned redaction directive.
      const targetResource = { scope_ref: request.target_scope_ref, source_record_id: request.source_record_id };
      const targetAuthorization = await authorizeOperation(dependencies.authorization, {
        operation: "capture",
        resource: targetResource,
        resource_digest: authorizationResourceDigest("capture", targetResource),
        context: request.authorization,
        issued_at: now,
        deadline_at: request.deadline_at,
      }, request.target_scope_ref, now);
      if (!targetAuthorization.ok) return operationFailure("propose_capitalisation", targetAuthorization as Result<never>);
      let redaction: RedactionResultV1;
      try {
        const redacted = await dependencies.authorization.redact({
          source_record: sourceRecord,
          target_scope_ref: request.target_scope_ref,
          directive: targetAuthorization.value.redaction,
          authorization_receipt_digest: targetAuthorization.value.receipt_digest,
        });
        if (!redacted.ok) return operationFailure("propose_capitalisation", redacted);
        const validRedaction = validateRedactionResult(redacted.value);
        if (validRedaction === undefined) return refusal("propose_capitalisation", "INVALID_SCHEMA", "redaction result is not exact");
        redaction = validRedaction;
      } catch {
        return unavailable("propose_capitalisation", "authorization port did not return a typed redaction");
      }
      const sanitized = validateCandidatePayload(redaction.payload);
      if (!sanitized.ok) return operationFailure("propose_capitalisation", sanitized);
      const transformReceipt = receiptDigest("capitalisation-transform", {
        source_record_id: request.source_record_id,
        source_record_digest: sourceRecord.record_digest,
        target_scope_ref: request.target_scope_ref,
        redaction_receipt_digest: redaction.receipt_digest,
      });
      const derivativePayload: CandidatePayloadV2 = {
        ...sanitized.value.payload,
        scope_ref: request.target_scope_ref,
        purpose_ref: request.purpose_ref,
        retention: request.retention,
        reconciliation: { family_refs: [] },
        derivation: {
          source_record_ids: [request.source_record_id],
          transform_ref: "graphify-memory:capitalise:v1",
          transform_receipt_digest: transformReceipt,
        },
      };
      const captureRequest = {
        schema_version: 2 as const,
        idempotency_key: request.idempotency_key,
        payload: derivativePayload,
        evidence: {
          evidence_ref: `capitalise:${request.source_record_id}`,
          evidence_digest: transformReceipt,
          citation_ids: derivativePayload.citations.map((citation) => citation.citation_id),
        },
        authorization: request.authorization,
        source_order: { source_ref: `capitalise:${request.source_record_id}`, sequence: "0" },
        deadline_at: request.deadline_at,
        cancellation_ref: `capitalise:${request.idempotency_key}`,
      };
      return operationFailure("propose_capitalisation", await port.capture(captureRequest) as Result<never>) as Result<CaptureAcknowledgementV1>;
    },
    proposeReconciliation: async (input): Promise<Result<ReconciliationOutcomeV1>> => {
      // T5.7 step 1: fresh readiness and provenance, like every fencing-dependent operation.
      const admitted = await admitFenced("propose_reconciliation");
      if (!admitted.ok) return admitted;
      const now = dependencies.clock?.now();
      if (!isInstant(now)) return unavailable("propose_reconciliation", "clock did not supply a canonical instant");
      // Step 2: exact-key validation of the request, distinct record ids.
      const checked = validateReconciliationRequest(input);
      if (!checked.ok) return checked;
      const request = checked.value;
      if (compareInstants(now, request.deadline_at) >= 0) return refusal("propose_reconciliation", "DEADLINE_EXCEEDED", "reconciliation deadline elapsed before proposal");
      // Step 3: capability before authorization — no registry, or an uninstalled family/version, refuses.
      const registry = dependencies.assertion_registry;
      if (registry === undefined) return unavailable("propose_reconciliation");
      const installed = registry.descriptors().some((descriptor) => descriptor.family_id === request.family_id && descriptor.version === request.family_version);
      if (!installed) return refusal("propose_reconciliation", "REGISTRY_VERSION_UNAVAILABLE", "requested assertion family or version is not installed");
      // Step 4: pin the comparison cursor on the system axis; the request carries no valid_as_of.
      const pin = request.comparison_system_as_of ?? admitted.value.high_water_cursor;
      if (!isCanonicalCursor(pin) || BigInt(pin) > BigInt(admitted.value.high_water_cursor)) {
        return refusal("propose_reconciliation", "STALE_PAGE", "comparison cursor is unavailable");
      }
      const [leftId, rightId] = utf8AscendingIds(request.left_record_id, request.right_record_id);
      // Step 5: per-record authorization, read, and revalidation at the record's own valid start, in UTF-8 ascending id order.
      const perRecord: Array<{ record: MemoryRecordV2; authorizationReceipt: Digest; revalidationReceipt: Digest; eligible: boolean }> = [];
      for (const recordId of [leftId, rightId]) {
        const resource = { record_id: recordId };
        const authorization = await authorizeOperation(dependencies.authorization, {
          operation: "propose_reconciliation",
          resource,
          resource_digest: authorizationResourceDigest("propose_reconciliation", resource),
          context: request.authorization,
          issued_at: now,
          deadline_at: request.deadline_at,
        }, undefined, now);
        if (!authorization.ok) return authorization;
        try {
          const read = await dependencies.canonical_store.readRecord({
            record_id: recordId,
            system_as_of: pin,
            authorization_receipt_digest: authorization.value.receipt_digest,
          });
          if (!read.ok) return operationFailure("propose_reconciliation", read);
          if (read.value.scope_ref !== authorization.value.scope_ref) return refusal("propose_reconciliation", "UNAUTHORIZED", "authorization scope does not bind the reconciliation record");
          // The store stays the final eligibility authority; revalidating each record at its own valid start
          // makes valid-time membership hold by construction, so the store decides state, tombstone, expiry and trust only.
          // Pure-read revalidation: no observed expiry, no journal event, no cursor, no outbox, no write transaction.
          const revalidated = await dependencies.canonical_store.revalidateReadOnly({
            record_ids: [recordId],
            valid_as_of: read.value.valid_time.t,
            system_as_of: pin,
            authorization_receipt_digest: authorization.value.receipt_digest,
            operation: "recall_current",
          });
          if (!revalidated.ok) return operationFailure("propose_reconciliation", revalidated);
          perRecord.push({
            record: read.value,
            authorizationReceipt: authorization.value.receipt_digest,
            revalidationReceipt: revalidated.value.receipt_digest,
            eligible: revalidated.value.eligible_record_ids.includes(recordId),
          });
        } catch {
          return unavailable("propose_reconciliation", "canonical store did not return typed reconciliation results");
        }
      }
      const [left, right] = perRecord;
      // Step 6: a store refusal or an eligibility-gate refusal yields an ineligible outcome, never an error.
      const gate = evaluateReconciliationEligibilityV1(
        { family_id: request.family_id, family_version: request.family_version, left: left.record, right: right.record, comparison_system_as_of: pin },
        {
          left: { record_id: left.record.record_id, state: "accepted_current", unexpired: true, dependency_eligible: true },
          right: { record_id: right.record.record_id, state: "accepted_current", unexpired: true, dependency_eligible: true },
        },
      );
      const eligible = left.eligible && right.eligible && gate.ok;
      // Step 7: the comparator runs only for an eligible pair.
      let proposal: ReconciliationProposalV1 | undefined;
      if (eligible) {
        const compared = registry.compare({ family_id: request.family_id, family_version: request.family_version, left: left.record, right: right.record, comparison_system_as_of: pin });
        if (!compared.ok) return operationFailure("propose_reconciliation", compared);
        proposal = compared.value;
      }
      // Step 8: return the digest-bound outcome; no journal write, no cursor allocation.
      const outcomeWithoutReceipt = defined({
        registry_id: registry.registry_id,
        registry_version: registry.registry_version,
        family_id: request.family_id,
        family_version: request.family_version,
        left_record_id: left.record.record_id,
        right_record_id: right.record.record_id,
        comparison_system_as_of: pin,
        eligible,
        proposal,
        eligibility_digest: receiptDigest("reconciliation-eligibility", {
          comparison_system_as_of: pin,
          records: perRecord.map((entry) => ({
            record_id: entry.record.record_id,
            record_digest: entry.record.record_digest,
            authorization_receipt_digest: entry.authorizationReceipt,
            revalidation_receipt_digest: entry.revalidationReceipt,
          })),
        }),
      });
      return { ok: true, value: { ...outcomeWithoutReceipt, receipt_digest: receiptDigest("reconciliation-outcome", outcomeWithoutReceipt) } };
    },
    invalidateProjections: async (input): Promise<Result<ProjectionInvalidationReceiptV1>> => {
      // FIN §4.2 step 1: fresh readiness and provenance, like every fencing-dependent operation.
      const admitted = await admitFenced("projection_invalidate");
      if (!admitted.ok) return admitted;
      const now = dependencies.clock?.now();
      if (!isInstant(now)) return unavailable("projection_invalidate", "clock did not supply a canonical instant");
      // Step 2: exact-key validation of the request.
      const checked = validateProjectionInvalidationRequest(input);
      if (!checked.ok) return checked;
      const request = checked.value;
      if (compareInstants(now, request.deadline_at) >= 0) return refusal("projection_invalidate", "DEADLINE_EXCEEDED", "invalidation deadline elapsed before cascade");
      // Step 3: capability before authorization — no configured surface refuses.
      const configured = dependencies.projection_surfaces;
      if (configured === undefined || configured.length === 0) return unavailable("projection_invalidate");
      // Step 4: the target cursor must be admitted.
      if (BigInt(request.through_cursor) > BigInt(admitted.value.high_water_cursor)) {
        return refusal("projection_invalidate", "STALE_PAGE", "invalidation cursor is unavailable");
      }
      // Step 5: authorize projection_invalidate over the store-wide empty resource (backup/restore precedent).
      const authorized = await authorizeOperation(dependencies.authorization, {
        operation: "projection_invalidate",
        resource: {},
        resource_digest: authorizationResourceDigest("projection_invalidate", {}),
        context: request.authorization,
        issued_at: now,
        deadline_at: request.deadline_at,
      }, undefined, now);
      if (!authorized.ok) return authorized;
      // Step 6: resolve the named subset before any cascade round; an unknown id refuses.
      const resolved: ProjectionInvalidationSurfaceV1[] = [];
      if (request.projection_ids !== undefined) {
        for (const projectionId of request.projection_ids) {
          const surface = configured.find((entry) => entry.projection_id === projectionId);
          if (surface === undefined) return refusal("projection_invalidate", "INVALID_SCHEMA", "unknown projection id");
          resolved.push(surface);
        }
        if (resolved.length === 0) return refusal("projection_invalidate", "INVALID_SCHEMA", "no projection surface selected");
      } else {
        resolved.push(...configured);
      }
      // Step 7: cascade rounds from "0", ONE outbox batch (one journal event) per round, so every
      // surface applies the canonical journal prefix in total order and a surface's state through a cursor
      // is a function of that ordered prefix — except records currently tombstoned, which the store
      // re-emits as removals (normative §1/§6, retroactive tombstone): an older through_cursor can never
      // roll a surface back past a terminal tombstone. The requested through_cursor is a MINIMUM coverage
      // (normative §1): rounds run to the admitted high-water mark, so an older request converging a
      // surface rebuilds it to the head instead of rolling it back. A receipt acks a cursor only when every
      // round through it was complete on every surface: an incomplete round pins the receipt to the last
      // complete cursor, says so explicitly, and stops — never advancing past the gap.
      // X2 tour 4 (MINEUR-1): the target is max(requested through_cursor, admitted high_water_cursor).
      // X2 tour 5 (P9, normative §6): invisible replay in two phases. Phase 1 walks the outbox to the
      // target WITHOUT contacting any surface — an interruption here leaves every surface untouched.
      // Phase 2 publishes the buffered batches in order with no deadline aborts mid-phase, then checks
      // the deadline ONCE before acknowledging: a call that overran its deadline still converges every
      // surface (no accepted record ever disappears), yet never certifies success. Surface faults keep
      // the tour-3 pin-and-recover semantics; only the deadline path is invisible.
      const target: Cursor = BigInt(request.through_cursor) > BigInt(admitted.value.high_water_cursor)
        ? request.through_cursor
        : admitted.value.high_water_cursor;
      // Phase 1 (private): read-only walk of the outbox to the target.
      const buffered: ProjectionBatchV1[] = [];
      let readAfter: Cursor = "0";
      for (;;) {
        const roundNow = dependencies.clock?.now();
        if (!isInstant(roundNow)) return unavailable("projection_invalidate", "clock did not supply a canonical instant");
        if (compareInstants(roundNow, request.deadline_at) >= 0) return refusal("projection_invalidate", "DEADLINE_EXCEEDED", "invalidation deadline elapsed during cascade");
        let read: Awaited<ReturnType<CanonicalMemoryStorePort["nextProjectionBatch"]>>;
        try {
          read = await dependencies.canonical_store.nextProjectionBatch({ after: readAfter, limit: 1 });
        } catch {
          return unavailable("projection_invalidate", "projection cascade did not return a typed result");
        }
        // First round with no batch: nothing to invalidate (the store's explicit exhaustion signal — the
        // only one that denotes outbox exhaustion). A later gap ends the walk; phase 2 publishes what
        // was read and the receipt states the covered prefix.
        if (!read.ok) {
          if (read.error.code === "NOT_FOUND" && buffered.length === 0) return read;
          break;
        }
        buffered.push(read.value);
        if (BigInt(read.value.through_cursor_inclusive) >= BigInt(target)) break;
        if (BigInt(read.value.through_cursor_inclusive) <= BigInt(readAfter)) break;
        readAfter = read.value.through_cursor_inclusive;
      }
      // Phase 2 (publication): settle at apply time and drive every buffered batch through the surfaces.
      let after: Cursor = "0";
      let covered: ProjectionInvalidationReceiptV1 | undefined;
      for (const batch of buffered) {
        let published: Awaited<ReturnType<typeof applyProjectionBatchV1>>;
        try {
          published = await applyProjectionBatchV1({ store: dependencies.canonical_store, surfaces: resolved, batch });
        } catch {
          return unavailable("projection_invalidate", "projection cascade did not return a typed result");
        }
        if (!published.ok) {
          // A surface NOT_FOUND already arrives as PROJECTION_STALE (tour 3, normative §5): a fault
          // certifies nothing, so the call fails even when earlier batches published — the caller
          // recovers them by replay, whose durable cursors survive.
          return published;
        }
        const receipt = published.value.receipt;
        if (!receipt.complete) {
          const body = { through_cursor: after, projection_receipts: receipt.projection_receipts, complete: false as const };
          return { ok: true, value: { ...body, receipt_digest: receiptDigest("projection-invalidation", body) } };
        }
        covered = receipt;
        if (BigInt(covered.through_cursor) >= BigInt(target)) break;
        if (BigInt(covered.through_cursor) <= BigInt(after)) break;
        after = covered.through_cursor;
      }
      if (covered === undefined) return refusal("projection_invalidate", "NOT_FOUND", "no projection batch is available");
      // The single certification gate: a call that overran its deadline converged the surfaces above but
      // publishes nothing — no acknowledgement, no success receipt. The caller retries and converges again.
      const publicationNow = dependencies.clock?.now();
      if (!isInstant(publicationNow)) return unavailable("projection_invalidate", "clock did not supply a canonical instant");
      if (compareInstants(publicationNow, request.deadline_at) >= 0) return refusal("projection_invalidate", "DEADLINE_EXCEEDED", "invalidation deadline elapsed before publication");
      const acknowledgement = await dependencies.canonical_store.acknowledgeProjection(covered);
      if (!acknowledgement.ok) return acknowledgement;
      return { ok: true, value: covered };
    },
    readiness: async () => {
      const readiness = await dependencies.canonical_store.readiness();
      return readiness.ok ? readiness : operationFailure("admin", readiness);
    },
    admin: async (request): Promise<Result<AdminEpochReceiptV1>> => {
      const provider = dependencies.admin_provider;
      // §5.5(a): absent provider refuses before any other check — graphify never ships a default administrator (§5.10).
      if (provider === undefined) return unavailable("admin", "no admin_provider is injected");
      const checked = validateAdminOperationRequest(request);
      if (!checked.ok) return operationFailure("admin", checked);
      const operation = checked.value;
      if (operation.operation === "bootstrap") {
        // §5.5(b): bootstrap requires an active fence whose live epoch equals the request epoch, verified BEFORE
        // dispatch. NOT wrapped by callAdminProvider — an engine/store fault here must not be masked as a provider fault.
        let readiness: Result<OperationalCapabilityReceiptV1>;
        try {
          readiness = await dependencies.canonical_store.readiness();
        } catch {
          // §5.7 keeps two distinct codes: a throwing store is broken (STORE_UNAVAILABLE), not a lost fence.
          return refusal("admin", "STORE_UNAVAILABLE", "canonical store threw instead of returning a capability receipt for bootstrap");
        }
        // propagate the store's own FENCE_LOST/STORE_UNAVAILABLE — the engine asserts FENCE_LOST only on an epoch mismatch.
        if (!readiness.ok) return operationFailure("admin", readiness);
        if (readiness.value.storage_epoch !== operation.bootstrap.storage_epoch) {
          return refusal("admin", "FENCE_LOST", "bootstrap storage_epoch does not equal the live storage fence epoch");
        }
        return callAdminProvider(() => provider.bootstrap(operation.bootstrap));
      }
      // §5.5(c): dispatch to the injected provider per discriminant; §5.5(d): normalizeAdminDenial maps a
      // provider-declared denial (denial:true) to UNAUTHORIZED, every other failure keeps its own code (e).
      if (operation.operation === "rotate") return callAdminProvider(() => provider.rotate(operation.rotate));
      if (operation.operation === "revoke") return callAdminProvider(() => provider.revoke(operation.revoke));
      // unreachable: validateAdminOperationRequest admits only bootstrap|rotate|revoke.
      return refusal("admin", "INVALID_SCHEMA", "unsupported admin operation");
    },
  };
  // X2 tour 4 (MAJEUR-1, normative §4): serialize invalidations — one cascade in flight per port, the
  // rest wait on projectionChain. invalidateOnce keeps the exact-key validation, STALE_PAGE, auth and
  // round semantics below; the wrapper only orders the calls.
  const invalidateOnce = port.invalidateProjections.bind(port);
  port.invalidateProjections = (input) => {
    const run = projectionChain.then(() => invalidateOnce(input));
    projectionChain = run.catch(() => undefined);
    return run;
  };
  return port;
}
