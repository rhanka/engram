import { normalizeCanonicalJson, type CanonicalJsonValue } from "./canonical-json.js";
import { knowledgePayloadDigest, memoryRecordDigest, recordIdFromDigest } from "./digests.js";
import type {
  AdminOperationRequestV1,
  CandidatePayloadV2,
  Cursor,
  Digest,
  MemoryErrorCode,
  MemoryOperation,
  MemoryRecordV2,
  ProjectionInvalidationRequestV1,
  ReconciliationCommandBindingV1,
  ReconciliationEventBindingV1,
  ReconciliationOutcomeV1,
  ReconciliationProposalV1,
  ReconciliationRequestV1,
  Result,
  TrustBindingV1,
  TrustRevalidationV1,
} from "./contracts/index.js";

const MAX_U64 = 18_446_744_073_709_551_615n;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CURSOR_PATTERN = /^(0|[1-9][0-9]*)$/;

const candidateKeys = [
  "schema_version", "scope_ref", "purpose_ref", "valid_time", "components",
  "primary_component_id", "primary_event", "citations", "retention", "reconciliation", "derivation",
];
const candidateRequired = candidateKeys.filter((key) => key !== "derivation");
const recordKeys = [
  ...candidateKeys,
  "record_id", "payload_digest", "record_digest", "recorded_at", "recorded_cursor",
  "authorization_receipt_digest", "trust",
];
const recordRequired = [
  ...candidateRequired,
  "record_id", "payload_digest", "record_digest", "recorded_at", "recorded_cursor",
  "authorization_receipt_digest", "trust",
];

class SchemaFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaFailure";
  }
}

export interface MemoryValidationOptions {
  /** Exact authorization-owned protection boundary; no topology is interpreted. */
  scope_ref?: string;
}

export interface ValidatedCandidatePayloadV2 {
  payload: CandidatePayloadV2;
  payload_digest: Digest;
}

export interface ValidatedMemoryRecordV2 {
  record: MemoryRecordV2;
  payload_digest: Digest;
  record_digest: Digest;
}

function refusal<T>(operation: MemoryOperation, code: MemoryErrorCode, message: string): Result<T> {
  return { ok: false, error: { code, operation, message, retryable: false } };
}

function assertObject(value: unknown, name: string): asserts value is Record<string, CanonicalJsonValue> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new SchemaFailure(`${name} must be an object`);
  }
}

function assertExactKeys(value: unknown, name: string, allowed: readonly string[], required: readonly string[]): asserts value is Record<string, CanonicalJsonValue> {
  assertObject(value, name);
  const keys = Object.keys(value);
  if (keys.some((key) => !allowed.includes(key)) || required.some((key) => !Object.hasOwn(value, key))) {
    throw new SchemaFailure(`${name} has an unexpected or missing property`);
  }
}

function assertString(value: unknown, name: string, minimumBytes = 1, maximumBytes = 512): asserts value is string {
  if (typeof value !== "string") throw new SchemaFailure(`${name} must be a string`);
  const bytes = new TextEncoder().encode(value).byteLength;
  if (bytes < minimumBytes || bytes > maximumBytes) throw new SchemaFailure(`${name} has invalid length`);
}

function assertOpaque(value: unknown, name: string): asserts value is string {
  assertString(value, name);
}

function assertDigest(value: unknown, name: string): asserts value is Digest {
  if (typeof value !== "string" || !DIGEST_PATTERN.test(value)) throw new SchemaFailure(`${name} must be a digest`);
}

function assertInstant(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || !INSTANT_PATTERN.test(value) || new Date(value).toISOString() !== value) {
    throw new SchemaFailure(`${name} must be an RFC 3339 UTC millisecond instant`);
  }
}

export function isCanonicalCursor(value: unknown): value is Cursor {
  if (typeof value !== "string" || !CURSOR_PATTERN.test(value)) return false;
  try {
    return BigInt(value) <= MAX_U64;
  } catch {
    return false;
  }
}

function assertCursor(value: unknown, name: string): asserts value is Cursor {
  if (!isCanonicalCursor(value)) throw new SchemaFailure(`${name} must be a canonical unsigned u64 cursor`);
}

function assertSafeEpoch(value: unknown, name: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new SchemaFailure(`${name} must be a safe integer epoch`);
}

function assertSortedUnique(values: unknown, name: string, minimum: number, maximum: number): asserts values is string[] {
  if (!Array.isArray(values) || values.length < minimum || values.length > maximum) {
    throw new SchemaFailure(`${name} has invalid cardinality`);
  }
  values.forEach((value, index) => {
    assertOpaque(value, `${name}[${index}]`);
    if (index > 0 && values[index - 1]! >= value) throw new SchemaFailure(`${name} must be sorted and unique`);
  });
}

function assertValidTime(value: unknown): void {
  assertExactKeys(value, "valid_time", ["t", "t_end"], ["t"]);
  assertSafeEpoch(value.t, "valid_time.t");
  if (Object.hasOwn(value, "t_end")) {
    assertSafeEpoch(value.t_end, "valid_time.t_end");
    if (value.t_end < value.t) throw new SchemaFailure("valid_time.t_end precedes valid_time.t");
  }
}

function assertCitations(value: unknown): Set<string> {
  if (!Array.isArray(value) || value.length < 1 || value.length > 256) {
    throw new SchemaFailure("citations has invalid cardinality");
  }
  const ids = new Set<string>();
  value.forEach((citation, index) => {
    assertExactKeys(citation, `citations[${index}]`, ["citation_id", "source_ref", "locator", "content_digest", "observed_at"], ["citation_id", "source_ref", "locator", "content_digest"]);
    assertOpaque(citation.citation_id, `citations[${index}].citation_id`);
    assertOpaque(citation.source_ref, `citations[${index}].source_ref`);
    assertExactKeys(citation.locator, `citations[${index}].locator`, ["scheme", "value"], ["scheme", "value"]);
    assertString(citation.locator.scheme, `citations[${index}].locator.scheme`);
    assertString(citation.locator.value, `citations[${index}].locator.value`);
    assertDigest(citation.content_digest, `citations[${index}].content_digest`);
    if (Object.hasOwn(citation, "observed_at")) assertInstant(citation.observed_at, `citations[${index}].observed_at`);
    if (ids.has(citation.citation_id)) throw new SchemaFailure("citation ids must be unique");
    ids.add(citation.citation_id);
  });
  return ids;
}

function assertComponents(value: unknown, citations: Set<string>): Map<string, Record<string, CanonicalJsonValue>> {
  if (!Array.isArray(value) || value.length < 1 || value.length > 64) {
    throw new SchemaFailure("components has invalid cardinality");
  }
  const components = new Map<string, Record<string, CanonicalJsonValue>>();
  value.forEach((component, index) => {
    assertExactKeys(component, `components[${index}]`, ["component_id", "kind", "text", "citation_ids"], ["component_id", "kind", "text", "citation_ids"]);
    assertOpaque(component.component_id, `components[${index}].component_id`);
    if (component.kind !== "context" && component.kind !== "decision" && component.kind !== "evidence") {
      throw new SchemaFailure(`components[${index}].kind is invalid`);
    }
    assertString(component.text, `components[${index}].text`, 1, 65_536);
    if (!Array.isArray(component.citation_ids) || component.citation_ids.length < 1) {
      throw new SchemaFailure(`components[${index}].citation_ids is invalid`);
    }
    const used = new Set<string>();
    component.citation_ids.forEach((citationId, citationIndex) => {
      assertOpaque(citationId, `components[${index}].citation_ids[${citationIndex}]`);
      if (!citations.has(citationId) || used.has(citationId)) throw new SchemaFailure("component citations must resolve and be unique");
      used.add(citationId);
    });
    if (components.has(component.component_id)) throw new SchemaFailure("component ids must be unique");
    components.set(component.component_id, component);
  });
  return components;
}

function assertCandidateShape(value: unknown): asserts value is CandidatePayloadV2 {
  assertExactKeys(value, "candidate", candidateKeys, candidateRequired);
  if (value.schema_version !== 2) throw new SchemaFailure("schema_version must be 2");
  assertOpaque(value.scope_ref, "scope_ref");
  assertOpaque(value.purpose_ref, "purpose_ref");
  assertValidTime(value.valid_time);
  const citations = assertCitations(value.citations);
  const components = assertComponents(value.components, citations);
  assertOpaque(value.primary_component_id, "primary_component_id");
  const primary = components.get(value.primary_component_id);
  if (primary === undefined) throw new SchemaFailure("primary_component_id must resolve exactly once");
  assertExactKeys(value.primary_event, "primary_event", ["at", "type_ref", "citation_id"], ["at", "type_ref", "citation_id"]);
  assertSafeEpoch(value.primary_event.at, "primary_event.at");
  assertOpaque(value.primary_event.type_ref, "primary_event.type_ref");
  assertOpaque(value.primary_event.citation_id, "primary_event.citation_id");
  if (!citations.has(value.primary_event.citation_id) || !(primary.citation_ids as string[]).includes(value.primary_event.citation_id)) {
    throw new SchemaFailure("primary event citation must resolve through the primary component");
  }
  assertExactKeys(value.retention, "retention", ["expires_at", "derivative_rule"], ["derivative_rule"]);
  if (Object.hasOwn(value.retention, "expires_at")) assertInstant(value.retention.expires_at, "retention.expires_at");
  if (value.retention.derivative_rule !== "retain" && value.retention.derivative_rule !== "make-ineligible") {
    throw new SchemaFailure("retention.derivative_rule is invalid");
  }
  assertExactKeys(value.reconciliation, "reconciliation", ["family_refs"], ["family_refs"]);
  assertSortedUnique(value.reconciliation.family_refs, "reconciliation.family_refs", 0, 64);
  if (Object.hasOwn(value, "derivation")) {
    assertExactKeys(value.derivation, "derivation", ["source_record_ids", "transform_ref", "transform_receipt_digest"], ["source_record_ids", "transform_ref", "transform_receipt_digest"]);
    assertSortedUnique(value.derivation.source_record_ids, "derivation.source_record_ids", 1, 64);
    assertOpaque(value.derivation.transform_ref, "derivation.transform_ref");
    assertDigest(value.derivation.transform_receipt_digest, "derivation.transform_receipt_digest");
  }
}

function assertTrust(value: unknown): asserts value is TrustBindingV1 {
  assertExactKeys(value, "trust", ["class", "evidence_digest", "verifier_id", "verifier_version", "issued_at", "expires_at", "revocation_epoch", "receipt_digest"], ["class", "evidence_digest", "verifier_id", "verifier_version", "issued_at", "revocation_epoch", "receipt_digest"]);
  if (value.class !== "earned" && value.class !== "asserted" && value.class !== "signed") {
    throw new SchemaFailure("trust.class is invalid");
  }
  assertDigest(value.evidence_digest, "trust.evidence_digest");
  assertOpaque(value.verifier_id, "trust.verifier_id");
  assertString(value.verifier_version, "trust.verifier_version");
  assertInstant(value.issued_at, "trust.issued_at");
  if (Object.hasOwn(value, "expires_at")) assertInstant(value.expires_at, "trust.expires_at");
  assertCursor(value.revocation_epoch, "trust.revocation_epoch");
  assertDigest(value.receipt_digest, "trust.receipt_digest");
}

function authorizedScope(value: CandidatePayloadV2, scope: string | undefined): boolean {
  if (value.scope_ref.includes("*") || (scope !== undefined && scope.includes("*"))) return false;
  return scope === undefined || value.scope_ref === scope;
}

export function validateCandidatePayload(input: unknown, options: MemoryValidationOptions = {}): Result<ValidatedCandidatePayloadV2> {
  let value: CanonicalJsonValue;
  try {
    value = normalizeCanonicalJson(input);
    assertCandidateShape(value);
  } catch (error) {
    return refusal("capture", "INVALID_SCHEMA", error instanceof Error ? error.message : "candidate is invalid");
  }
  if (!authorizedScope(value, options.scope_ref)) {
    return refusal("capture", "UNAUTHORIZED", "candidate scope does not exactly match authorization");
  }
  return { ok: true, value: { payload: value, payload_digest: knowledgePayloadDigest(value) } };
}

function candidateFromRecord(record: Record<string, CanonicalJsonValue>): CandidatePayloadV2 {
  const candidate = Object.fromEntries(candidateKeys.filter((key) => Object.hasOwn(record, key)).map((key) => [key, record[key]]));
  return candidate as unknown as CandidatePayloadV2;
}

export function validateMemoryRecord(input: unknown, options: MemoryValidationOptions = {}): Result<ValidatedMemoryRecordV2> {
  let record: Record<string, CanonicalJsonValue>;
  try {
    const normalized = normalizeCanonicalJson(input);
    assertExactKeys(normalized, "record", recordKeys, recordRequired);
    record = normalized;
    const candidate = candidateFromRecord(record);
    assertCandidateShape(candidate);
    assertString(record.record_id, "record_id");
    assertDigest(record.payload_digest, "payload_digest");
    assertDigest(record.record_digest, "record_digest");
    assertInstant(record.recorded_at, "recorded_at");
    assertCursor(record.recorded_cursor, "recorded_cursor");
    assertDigest(record.authorization_receipt_digest, "authorization_receipt_digest");
    assertTrust(record.trust);
  } catch (error) {
    return refusal("request_admission", "INVALID_SCHEMA", error instanceof Error ? error.message : "record is invalid");
  }
  const candidate = candidateFromRecord(record);
  if (!authorizedScope(candidate, options.scope_ref)) {
    return refusal("request_admission", "UNAUTHORIZED", "record scope does not exactly match authorization");
  }
  const payloadDigest = knowledgePayloadDigest(candidate);
  if (record.payload_digest !== payloadDigest) {
    return refusal("request_admission", "INVALID_DIGEST", "payload_digest does not bind immutable knowledge fields");
  }
  const typedRecord = record as unknown as MemoryRecordV2;
  const recordDigest = memoryRecordDigest(typedRecord);
  if (typedRecord.record_digest !== recordDigest || typedRecord.record_id !== recordIdFromDigest(recordDigest)) {
    return refusal("request_admission", "INVALID_DIGEST", "record digest or record id does not bind immutable writer fields");
  }
  return { ok: true, value: { record: typedRecord, payload_digest: payloadDigest, record_digest: recordDigest } };
}

/** Pure receipt gate used before a record becomes eligible for a read. */
export function evaluateTrustEligibility(binding: TrustBindingV1, revalidation: TrustRevalidationV1): Result<{ eligible: true }> {
  if (binding.receipt_digest !== revalidation.binding_receipt_digest) {
    return refusal("recall_current", "INVALID_DIGEST", "trust revalidation does not bind the trust receipt");
  }
  if (revalidation.valid && revalidation.reason === "valid" && revalidation.current_revocation_epoch === binding.revocation_epoch) {
    return { ok: true, value: { eligible: true } };
  }
  const code = revalidation.reason === "revoked"
    ? "AUTHORIZATION_REVOKED"
    : revalidation.reason === "expired"
      ? "AUTHORIZATION_EXPIRED"
      : "UNAUTHORIZED";
  return refusal("recall_current", code, `trust receipt is ${revalidation.reason}`);
}


// SHAPE GATE ONLY: checks the discriminant, sub-request presence, non-empty strings and isObj (so it accepts `authorization: {}`).
// A green result means the request is well-formed, NOT that it is an authorized/valid admin operation — the engine + AdminProviderPort decide that.
export function validateAdminOperationRequest(input: unknown): Result<AdminOperationRequestV1> {
  const fail = (message: string) => refusal<AdminOperationRequestV1>("admin", "INVALID_SCHEMA", message);
  const isStr = (x: unknown): x is string => typeof x === "string" && x.length > 0;
  const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;
  if (!isObj(input)) return fail("admin request must be an object");
  switch (input.operation) {
    case "bootstrap": {
      const r = input.bootstrap;
      if (!isObj(r)) return fail("bootstrap sub-request is required");
      if (!isStr(r.store_id) || !isStr(r.storage_epoch) || !isStr(r.admin_credential_ref) || !isStr(r.deadline_at))
        return fail("bootstrap requires store_id, storage_epoch, admin_credential_ref, deadline_at");
      break;
    }
    case "rotate": {
      const r = input.rotate;
      if (!isObj(r)) return fail("rotate sub-request is required");
      if (!isStr(r.store_id) || !isStr(r.current_authorization_epoch) || !isObj(r.authorization) || !isStr(r.deadline_at))
        return fail("rotate requires store_id, current_authorization_epoch, authorization, deadline_at");
      break;
    }
    case "revoke": {
      const r = input.revoke;
      if (!isObj(r)) return fail("revoke sub-request is required");
      if (!isStr(r.store_id) || !isStr(r.current_authorization_epoch) || !isStr(r.credential_digest) || !isObj(r.authorization) || !isStr(r.deadline_at))
        return fail("revoke requires store_id, current_authorization_epoch, credential_digest, authorization, deadline_at");
      break;
    }
    default:
      return fail("operation must be one of bootstrap|rotate|revoke");
  }
  return { ok: true, value: input as AdminOperationRequestV1 };
}

const RECONCILIATION_RELATIONS = [
  "contradicts",
  "left_supersedes_right",
  "right_supersedes_left",
  "needs_adjudication",
] as const;

function isReconciliationRelation(value: unknown): value is (typeof RECONCILIATION_RELATIONS)[number] {
  return typeof value === "string" && (RECONCILIATION_RELATIONS as readonly string[]).includes(value);
}

function assertReconciliationProposalShape(value: unknown, name = "proposal"): asserts value is ReconciliationProposalV1 {
  assertExactKeys(
    value,
    name,
    [
      "proposal_id",
      "family_id",
      "family_version",
      "occurrence_key",
      "left_record_id",
      "right_record_id",
      "relation",
      "comparison_system_as_of",
      "evidence_citation_ids",
      "proposal_digest",
    ],
    [
      "proposal_id",
      "family_id",
      "family_version",
      "occurrence_key",
      "left_record_id",
      "right_record_id",
      "relation",
      "comparison_system_as_of",
      "evidence_citation_ids",
      "proposal_digest",
    ],
  );
  assertDigest(value.proposal_id, `${name}.proposal_id`);
  assertOpaque(value.family_id, `${name}.family_id`);
  assertString(value.family_version, `${name}.family_version`);
  assertString(value.occurrence_key, `${name}.occurrence_key`);
  assertString(value.left_record_id, `${name}.left_record_id`);
  assertString(value.right_record_id, `${name}.right_record_id`);
  if (!isReconciliationRelation(value.relation)) {
    throw new SchemaFailure(`${name}.relation is invalid`);
  }
  assertCursor(value.comparison_system_as_of, `${name}.comparison_system_as_of`);
  assertSortedUnique(value.evidence_citation_ids, `${name}.evidence_citation_ids`, 0, Number.MAX_SAFE_INTEGER);
  assertDigest(value.proposal_digest, `${name}.proposal_digest`);
}

export function validateReconciliationRequest(input: unknown): Result<ReconciliationRequestV1> {
  try {
    const value = normalizeCanonicalJson(input);
    assertExactKeys(
      value,
      "reconciliation_request",
      ["family_id", "family_version", "left_record_id", "right_record_id", "comparison_system_as_of", "authorization", "deadline_at"],
      ["family_id", "family_version", "left_record_id", "right_record_id", "authorization", "deadline_at"],
    );
    assertOpaque(value.family_id, "family_id");
    assertString(value.family_version, "family_version");
    assertString(value.left_record_id, "left_record_id");
    assertString(value.right_record_id, "right_record_id");
    if (value.left_record_id === value.right_record_id) {
      throw new SchemaFailure("left_record_id and right_record_id must be distinct");
    }
    if (Object.hasOwn(value, "comparison_system_as_of")) {
      assertCursor(value.comparison_system_as_of, "comparison_system_as_of");
    }
    assertExactKeys(value.authorization, "authorization", ["credential", "context_ref"], ["credential"]);
    if (typeof value.authorization.credential !== "string") {
      throw new SchemaFailure("authorization.credential must be a string");
    }
    if (Object.hasOwn(value.authorization, "context_ref")) {
      assertOpaque(value.authorization.context_ref, "authorization.context_ref");
    }
    assertInstant(value.deadline_at, "deadline_at");
    return { ok: true, value: value as unknown as ReconciliationRequestV1 };
  } catch (error) {
    return refusal("propose_reconciliation", "INVALID_SCHEMA", error instanceof Error ? error.message : "reconciliation request is invalid");
  }
}

export function validateProjectionInvalidationRequest(input: unknown): Result<ProjectionInvalidationRequestV1> {
  try {
    const value = normalizeCanonicalJson(input);
    assertExactKeys(
      value,
      "projection_invalidation_request",
      ["through_cursor", "projection_ids", "authorization", "deadline_at"],
      ["through_cursor", "authorization", "deadline_at"],
    );
    assertCursor(value.through_cursor, "through_cursor");
    if (Object.hasOwn(value, "projection_ids")) {
      if (!Array.isArray(value.projection_ids)) throw new SchemaFailure("projection_ids must be an array");
      value.projection_ids.forEach((projectionId, index) => assertOpaque(projectionId, `projection_ids[${index}]`));
    }
    assertExactKeys(value.authorization, "authorization", ["credential", "context_ref"], ["credential"]);
    if (typeof value.authorization.credential !== "string") {
      throw new SchemaFailure("authorization.credential must be a string");
    }
    if (Object.hasOwn(value.authorization, "context_ref")) {
      assertOpaque(value.authorization.context_ref, "authorization.context_ref");
    }
    assertInstant(value.deadline_at, "deadline_at");
    return { ok: true, value: value as unknown as ProjectionInvalidationRequestV1 };
  } catch (error) {
    return refusal("projection_invalidate", "INVALID_SCHEMA", error instanceof Error ? error.message : "projection invalidation request is invalid");
  }
}

export function validateReconciliationOutcome(input: unknown): Result<ReconciliationOutcomeV1> {
  try {
    const value = normalizeCanonicalJson(input);
    assertExactKeys(
      value,
      "reconciliation_outcome",
      ["registry_id", "registry_version", "family_id", "family_version", "left_record_id", "right_record_id", "comparison_system_as_of", "eligible", "proposal", "eligibility_digest", "receipt_digest"],
      ["registry_id", "registry_version", "family_id", "family_version", "left_record_id", "right_record_id", "comparison_system_as_of", "eligible", "eligibility_digest", "receipt_digest"],
    );
    assertOpaque(value.registry_id, "registry_id");
    assertString(value.registry_version, "registry_version");
    assertOpaque(value.family_id, "family_id");
    assertString(value.family_version, "family_version");
    assertString(value.left_record_id, "left_record_id");
    assertString(value.right_record_id, "right_record_id");
    // Hex comparison preserves UTF-8 byte order, including non-BMP identifiers.
    const leftIdBytes = Buffer.from(value.left_record_id, "utf8").toString("hex");
    const rightIdBytes = Buffer.from(value.right_record_id, "utf8").toString("hex");
    if (leftIdBytes >= rightIdBytes) {
      throw new SchemaFailure("outcome record ids must be distinct and in UTF-8 ascending order");
    }
    assertCursor(value.comparison_system_as_of, "comparison_system_as_of");
    if (typeof value.eligible !== "boolean") {
      throw new SchemaFailure("eligible must be a boolean");
    }
    if (Object.hasOwn(value, "proposal")) {
      if (!value.eligible) throw new SchemaFailure("an ineligible outcome must not include a proposal");
      assertReconciliationProposalShape(value.proposal, "reconciliation_outcome.proposal");
      if (value.proposal.family_id !== value.family_id
        || value.proposal.family_version !== value.family_version
        || value.proposal.left_record_id !== value.left_record_id
        || value.proposal.right_record_id !== value.right_record_id
        || value.proposal.comparison_system_as_of !== value.comparison_system_as_of) {
        throw new SchemaFailure("proposal family, record pair and comparison cursor must match the outcome");
      }
    }
    assertDigest(value.eligibility_digest, "eligibility_digest");
    assertDigest(value.receipt_digest, "receipt_digest");
    return { ok: true, value: value as unknown as ReconciliationOutcomeV1 };
  } catch (error) {
    return refusal("propose_reconciliation", "INVALID_SCHEMA", error instanceof Error ? error.message : "reconciliation outcome is invalid");
  }
}

export function validateReconciliationCommandBinding(input: unknown): Result<ReconciliationCommandBindingV1> {
  try {
    const value = normalizeCanonicalJson(input);
    assertExactKeys(
      value,
      "reconciliation_command_binding",
      ["proposal", "registry_id", "registry_version"],
      ["proposal", "registry_id", "registry_version"],
    );
    assertReconciliationProposalShape(value.proposal, "reconciliation_command_binding.proposal");
    assertOpaque(value.registry_id, "registry_id");
    assertString(value.registry_version, "registry_version");
    return { ok: true, value: value as unknown as ReconciliationCommandBindingV1 };
  } catch (error) {
    return refusal("dispute", "INVALID_SCHEMA", error instanceof Error ? error.message : "reconciliation command binding is invalid");
  }
}

export function validateReconciliationEventBinding(input: unknown): Result<ReconciliationEventBindingV1> {
  try {
    const value = normalizeCanonicalJson(input);
    assertExactKeys(
      value,
      "reconciliation_event_binding",
      ["proposal_id", "proposal_digest", "family_id", "family_version", "registry_id", "registry_version"],
      ["proposal_id", "proposal_digest", "family_id", "family_version", "registry_id", "registry_version"],
    );
    assertDigest(value.proposal_id, "proposal_id");
    assertDigest(value.proposal_digest, "proposal_digest");
    assertOpaque(value.family_id, "family_id");
    assertString(value.family_version, "family_version");
    assertOpaque(value.registry_id, "registry_id");
    assertString(value.registry_version, "registry_version");
    return { ok: true, value: value as unknown as ReconciliationEventBindingV1 };
  } catch (error) {
    return refusal("dispute", "INVALID_SCHEMA", error instanceof Error ? error.message : "reconciliation event binding is invalid");
  }
}
