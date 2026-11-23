import { canonicalizeJcs } from "../canonical-json.js";
import type {
  AuthorizationPort,
  Digest,
  MemoryErrorCode,
  OpaqueRef,
  RedactionDirectiveV1,
  RedactionRequestV1,
  RedactionResultV1,
  Result,
} from "../contracts/index.js";
import { knowledgePayloadDigest, receiptDigest } from "../digests.js";
import { applyPortOwnedRedaction } from "../engine.js";
import {
  assertDigest,
  assertOpaque,
  assertSafeEpoch,
  SchemaFailure,
  validateCandidatePayload,
  validateMemoryRecord,
} from "../validation.js";
import {
  screenForDenyListV1,
  validateConfidentialityDenyListV1,
  type ConfidentialityDenyListV1,
} from "./deny-list.js";
import {
  decodeStrictObject,
  decodeStrictShallowEnvelope,
  isActorPseudonymV1,
  isSessionPseudonymV1,
  privacyRefusal,
} from "./pseudonym.js";

export const MAX_SYNC_TURN_TEXT_BYTES = 65_536;

export interface PiiArmorStampV1 {
  readonly policyVersion: string;
  readonly redactionReceiptDigest: Digest;
  readonly d7BlacklistVersion: string;
  readonly d33Pseudonymized: true;
}

export type EgressMetamodelClassV1 =
  | "raw_event"
  | "turn_text"
  | "typed_node"
  | "typed_edge"
  | "ontology_template"
  | "control_verdict"
  | "context_log"
  | "context_summary";

export type EgressBoundaryKindV1 =
  | "same-workspace-sync"
  | "cross-workspace"
  | "cross-tenant"
  | "study"
  | "external-model";

export type CrossBoundaryEgressKindV1 = Exclude<EgressBoundaryKindV1, "same-workspace-sync">;

export interface PiiArmorRedactionReceiptV1 {
  readonly policyVersion: string;
  readonly d7BlacklistVersion: string;
  readonly d7BlacklistDigest: Digest;
  readonly sourceScopeRef: OpaqueRef;
  readonly targetScopeRef: OpaqueRef;
  readonly boundary: CrossBoundaryEgressKindV1;
  readonly authorizationReceiptDigest: Digest;
  readonly sourceRecordDigest: Digest;
  readonly portRedactionReceiptDigest: Digest;
  readonly outputPayloadDigest: Digest;
  readonly d33Pseudonymized: true;
  readonly receiptDigest: Digest;
}

export interface PiiArmorExpectedPolicyV1 {
  readonly policyVersion: string;
  readonly d7BlacklistVersion: string;
  readonly d7BlacklistDigest: Digest;
}

export interface PiiArmorStampBindingV1 {
  readonly redactionReceipt: PiiArmorRedactionReceiptV1;
  readonly sourceScopeRef: OpaqueRef;
  readonly targetScopeRef: OpaqueRef;
  readonly boundary: CrossBoundaryEgressKindV1;
  readonly authorizationReceiptDigest: Digest;
  readonly payloadDigest: Digest;
}

export interface PiiArmorRedactionInputV1 {
  readonly authorizationPort: AuthorizationPort;
  readonly request: RedactionRequestV1;
  readonly denyList: ConfidentialityDenyListV1;
  readonly policyVersion: string;
  readonly boundary: CrossBoundaryEgressKindV1;
  readonly d33Pseudonymized: boolean;
  readonly actorPseudoId?: string;
  readonly sessionPseudoId?: string;
  readonly termSalt?: string;
}

export interface PiiArmorRedactionOutputV1 {
  readonly redaction: RedactionResultV1;
  readonly redactionReceipt: PiiArmorRedactionReceiptV1;
  readonly stamp: PiiArmorStampV1;
  readonly packetBytes: number;
}

export interface EgressBoundaryRequestV1 {
  readonly boundary: EgressBoundaryKindV1;
  readonly metamodelClass: EgressMetamodelClassV1;
  readonly sourceScopeRef?: OpaqueRef;
  readonly targetScopeRef?: OpaqueRef;
  readonly authorizationReceiptDigest?: Digest;
  readonly payloadDigest?: Digest;
  readonly piiArmorStamp?: PiiArmorStampV1 | null;
  readonly redactionReceipt?: PiiArmorRedactionReceiptV1 | null;
  readonly expectedPolicy?: PiiArmorExpectedPolicyV1;
  readonly packetBytes?: number;
  readonly maxPacketBytes?: number;
  readonly workspaceSyncEnabled?: boolean;
  readonly contentPolicyAllowsSync?: boolean;
  readonly turnTextBytes?: number;
  readonly mandateAllowsContextTransfer?: boolean;
  readonly repoPolicyAllowsContextTransfer?: boolean;
}

export type EgressBoundaryDecisionV1 =
  | {
      readonly permitted: true;
      readonly crossesBoundary: false;
      readonly mode: "integral-unmasked" | "mandated-context-transfer";
    }
  | {
      readonly permitted: true;
      readonly crossesBoundary: true;
      readonly mode: "pii-armored";
      readonly stamp: PiiArmorStampV1;
    };

const EGRESS_CLASSES: readonly EgressMetamodelClassV1[] = [
  "raw_event",
  "turn_text",
  "typed_node",
  "typed_edge",
  "ontology_template",
  "control_verdict",
  "context_log",
  "context_summary",
];

const EGRESS_BOUNDARIES: readonly EgressBoundaryKindV1[] = [
  "same-workspace-sync",
  "cross-workspace",
  "cross-tenant",
  "study",
  "external-model",
];

const VALID_MEMORY_ERROR_CODES: ReadonlySet<string> = new Set<MemoryErrorCode>([
  "INVALID_SCHEMA",
  "INVALID_DIGEST",
  "DIGEST_CONFLICT",
  "UNAUTHORIZED",
  "AUTHORIZATION_EXPIRED",
  "AUTHORIZATION_REVOKED",
  "POLICY_UNAVAILABLE",
  "POLICY_STALE",
  "ILLEGAL_TRANSITION",
  "NOT_FOUND",
  "ALREADY_TERMINAL",
  "DEADLINE_EXCEEDED",
  "CANCELLED",
  "CAPABILITY_UNAVAILABLE",
  "STORE_UNAVAILABLE",
  "FENCE_LOST",
  "CURSOR_GAP",
  "JOURNAL_CORRUPT",
  "BLOB_MISSING",
  "PROJECTION_STALE",
  "PROJECTION_OVERSIZED",
  "RANKING_UNAVAILABLE",
  "STALE_PAGE",
  "REGISTRY_VERSION_UNAVAILABLE",
  "BACKUP_INVALID",
  "RESTORE_REFUSED",
  "MIGRATION_LEDGER_INVALID",
]);

function normalizePortRedactionFailure<T>(result: unknown): Result<T> {
  try {
    if (result !== null && typeof result === "object" && (result as { ok?: unknown }).ok === false) {
      const err = (result as { error?: unknown }).error;
      if (err !== null && typeof err === "object") {
        const candidate = err as {
          readonly code?: unknown;
          readonly message?: unknown;
          readonly retryable?: unknown;
        };
        if (
          typeof candidate.code === "string"
          && VALID_MEMORY_ERROR_CODES.has(candidate.code)
          && typeof candidate.message === "string"
          && candidate.message.length > 0
          && typeof candidate.retryable === "boolean"
        ) {
          return {
            ok: false,
            error: {
              code: candidate.code as MemoryErrorCode,
              operation: "propose_capitalisation",
              message: candidate.message,
              retryable: candidate.retryable,
            },
          };
        }
      }
    }
  } catch {
    // Fall through to fail-closed POLICY_UNAVAILABLE refusal.
  }
  return privacyRefusal(
    "propose_capitalisation",
    "POLICY_UNAVAILABLE",
    "AuthorizationPort.redact failed",
  );
}

function isEgressClass(value: unknown): value is EgressMetamodelClassV1 {
  return typeof value === "string" && (EGRESS_CLASSES as readonly string[]).includes(value);
}

function isEgressBoundary(value: unknown): value is EgressBoundaryKindV1 {
  return typeof value === "string" && (EGRESS_BOUNDARIES as readonly string[]).includes(value);
}

function isCrossBoundary(value: unknown): value is CrossBoundaryEgressKindV1 {
  return isEgressBoundary(value) && value !== "same-workspace-sync";
}

function assertNonBlankRef(value: unknown, field: string): OpaqueRef {
  assertOpaque(value, field);
  if (value.trim().length === 0 || value.includes("\0")) {
    throw new SchemaFailure(`${field} must be a non-blank string without NUL bytes`);
  }
  return value;
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function computePiiArmorRedactionReceiptDigest(
  body: Omit<PiiArmorRedactionReceiptV1, "receiptDigest">,
): Digest {
  return receiptDigest("pii-armor-redaction", body, "receiptDigest");
}

function isValidJsonPointer(pointer: string): boolean {
  if (pointer === "") {
    return true;
  }
  if (!pointer.startsWith("/")) {
    return false;
  }
  for (const segment of pointer.slice(1).split("/")) {
    if (/~(?:[^01]|$)/.test(segment)) {
      return false;
    }
  }
  return true;
}

function decodeRedactionDirectiveStrict(value: unknown): RedactionDirectiveV1 {
  const obj = decodeStrictObject(
    value,
    "request.directive",
    ["mode", "allowed_fields", "allow_derivation_lineage", "max_packet_bytes"],
    ["mode", "allowed_fields", "allow_derivation_lineage", "max_packet_bytes"],
  );
  if (obj.mode !== "field-allowlist") {
    throw new SchemaFailure("request.directive.mode must be field-allowlist");
  }
  if (typeof obj.allow_derivation_lineage !== "boolean") {
    throw new SchemaFailure("request.directive.allow_derivation_lineage must be a boolean");
  }
  assertSafeEpoch(obj.max_packet_bytes, "request.directive.max_packet_bytes");
  if (obj.max_packet_bytes < 1) {
    throw new SchemaFailure("request.directive.max_packet_bytes must be positive");
  }
  if (!Array.isArray(obj.allowed_fields)) {
    throw new SchemaFailure("request.directive.allowed_fields must be a dense array");
  }
  const allowedFields: string[] = [];
  let previous: string | undefined;
  for (let index = 0; index < obj.allowed_fields.length; index += 1) {
    const field = obj.allowed_fields[index];
    if (typeof field !== "string" || !isValidJsonPointer(field)) {
      throw new SchemaFailure(`request.directive.allowed_fields[${index}] is not a valid JSON pointer`);
    }
    if (previous !== undefined && previous >= field) {
      throw new SchemaFailure("request.directive.allowed_fields must be strictly sorted and unique");
    }
    previous = field;
    allowedFields.push(field);
  }
  return {
    mode: "field-allowlist",
    allowed_fields: allowedFields,
    allow_derivation_lineage: obj.allow_derivation_lineage,
    max_packet_bytes: obj.max_packet_bytes,
  };
}

function decodeExpectedPolicy(value: unknown): Result<PiiArmorExpectedPolicyV1> {
  if (value === undefined || value === null) {
    return privacyRefusal(
      "propose_capitalisation",
      "POLICY_UNAVAILABLE",
      "active PII armor policy is unavailable",
    );
  }
  try {
    const obj = decodeStrictObject(
      value,
      "expectedPolicy",
      ["policyVersion", "d7BlacklistVersion", "d7BlacklistDigest"],
      ["policyVersion", "d7BlacklistVersion", "d7BlacklistDigest"],
    );
    assertOpaque(obj.policyVersion, "expectedPolicy.policyVersion");
    assertOpaque(obj.d7BlacklistVersion, "expectedPolicy.d7BlacklistVersion");
    assertDigest(obj.d7BlacklistDigest, "expectedPolicy.d7BlacklistDigest");
    return {
      ok: true,
      value: {
        policyVersion: obj.policyVersion,
        d7BlacklistVersion: obj.d7BlacklistVersion,
        d7BlacklistDigest: obj.d7BlacklistDigest,
      },
    };
  } catch {
    return privacyRefusal(
      "propose_capitalisation",
      "POLICY_UNAVAILABLE",
      "active PII armor policy is invalid",
    );
  }
}

function decodeRedactionReceipt(value: unknown): PiiArmorRedactionReceiptV1 {
  const obj = decodeStrictObject(
    value,
    "redactionReceipt",
    [
      "policyVersion",
      "d7BlacklistVersion",
      "d7BlacklistDigest",
      "sourceScopeRef",
      "targetScopeRef",
      "boundary",
      "authorizationReceiptDigest",
      "sourceRecordDigest",
      "portRedactionReceiptDigest",
      "outputPayloadDigest",
      "d33Pseudonymized",
      "receiptDigest",
    ],
    [
      "policyVersion",
      "d7BlacklistVersion",
      "d7BlacklistDigest",
      "sourceScopeRef",
      "targetScopeRef",
      "boundary",
      "authorizationReceiptDigest",
      "sourceRecordDigest",
      "portRedactionReceiptDigest",
      "outputPayloadDigest",
      "d33Pseudonymized",
      "receiptDigest",
    ],
  );
  assertOpaque(obj.policyVersion, "redactionReceipt.policyVersion");
  assertOpaque(obj.d7BlacklistVersion, "redactionReceipt.d7BlacklistVersion");
  assertDigest(obj.d7BlacklistDigest, "redactionReceipt.d7BlacklistDigest");
  const sourceScopeRef = assertNonBlankRef(obj.sourceScopeRef, "redactionReceipt.sourceScopeRef");
  const targetScopeRef = assertNonBlankRef(obj.targetScopeRef, "redactionReceipt.targetScopeRef");
  if (!isCrossBoundary(obj.boundary)) {
    throw new SchemaFailure("redactionReceipt.boundary must be a cross-boundary kind");
  }
  assertDigest(obj.authorizationReceiptDigest, "redactionReceipt.authorizationReceiptDigest");
  assertDigest(obj.sourceRecordDigest, "redactionReceipt.sourceRecordDigest");
  assertDigest(obj.portRedactionReceiptDigest, "redactionReceipt.portRedactionReceiptDigest");
  assertDigest(obj.outputPayloadDigest, "redactionReceipt.outputPayloadDigest");
  if (obj.d33Pseudonymized !== true) {
    throw new SchemaFailure("redactionReceipt.d33Pseudonymized must be true");
  }
  assertDigest(obj.receiptDigest, "redactionReceipt.receiptDigest");
  return {
    policyVersion: obj.policyVersion,
    d7BlacklistVersion: obj.d7BlacklistVersion,
    d7BlacklistDigest: obj.d7BlacklistDigest,
    sourceScopeRef,
    targetScopeRef,
    boundary: obj.boundary,
    authorizationReceiptDigest: obj.authorizationReceiptDigest,
    sourceRecordDigest: obj.sourceRecordDigest,
    portRedactionReceiptDigest: obj.portRedactionReceiptDigest,
    outputPayloadDigest: obj.outputPayloadDigest,
    d33Pseudonymized: true,
    receiptDigest: obj.receiptDigest,
  };
}

function decodeStampBinding(value: unknown): PiiArmorStampBindingV1 {
  const obj = decodeStrictObject(
    value,
    "stampBinding",
    [
      "redactionReceipt",
      "sourceScopeRef",
      "targetScopeRef",
      "boundary",
      "authorizationReceiptDigest",
      "payloadDigest",
    ],
    [
      "redactionReceipt",
      "sourceScopeRef",
      "targetScopeRef",
      "boundary",
      "authorizationReceiptDigest",
      "payloadDigest",
    ],
  );
  const redactionReceipt = decodeRedactionReceipt(obj.redactionReceipt);
  const sourceScopeRef = assertNonBlankRef(obj.sourceScopeRef, "stampBinding.sourceScopeRef");
  const targetScopeRef = assertNonBlankRef(obj.targetScopeRef, "stampBinding.targetScopeRef");
  if (!isCrossBoundary(obj.boundary)) {
    throw new SchemaFailure("stampBinding.boundary must be a cross-boundary kind");
  }
  assertDigest(obj.authorizationReceiptDigest, "stampBinding.authorizationReceiptDigest");
  assertDigest(obj.payloadDigest, "stampBinding.payloadDigest");
  return {
    redactionReceipt,
    sourceScopeRef,
    targetScopeRef,
    boundary: obj.boundary,
    authorizationReceiptDigest: obj.authorizationReceiptDigest,
    payloadDigest: obj.payloadDigest,
  };
}

export function verifyPiiArmorStampV1(
  stamp: unknown,
  expectedPolicy: unknown,
  binding: unknown,
): Result<PiiArmorStampV1> {
  const policyRes = decodeExpectedPolicy(expectedPolicy);
  if (!policyRes.ok) {
    return policyRes;
  }
  if (stamp === undefined || stamp === null) {
    return privacyRefusal(
      "propose_capitalisation",
      "UNAUTHORIZED",
      "cross-boundary egress requires a valid PiiArmorStamp",
    );
  }
  let parsedStamp: PiiArmorStampV1;
  try {
    const obj = decodeStrictObject(
      stamp,
      "piiArmorStamp",
      ["policyVersion", "redactionReceiptDigest", "d7BlacklistVersion", "d33Pseudonymized"],
      ["policyVersion", "redactionReceiptDigest", "d7BlacklistVersion", "d33Pseudonymized"],
    );
    assertOpaque(obj.policyVersion, "piiArmorStamp.policyVersion");
    assertDigest(obj.redactionReceiptDigest, "piiArmorStamp.redactionReceiptDigest");
    assertOpaque(obj.d7BlacklistVersion, "piiArmorStamp.d7BlacklistVersion");
    if (obj.d33Pseudonymized !== true) {
      throw new SchemaFailure("piiArmorStamp.d33Pseudonymized must be true");
    }
    parsedStamp = {
      policyVersion: obj.policyVersion,
      redactionReceiptDigest: obj.redactionReceiptDigest,
      d7BlacklistVersion: obj.d7BlacklistVersion,
      d33Pseudonymized: true,
    };
  } catch {
    return privacyRefusal(
      "propose_capitalisation",
      "UNAUTHORIZED",
      "PiiArmorStamp is malformed or unpseudonymized",
    );
  }

  if (binding === undefined || binding === null) {
    return privacyRefusal(
      "propose_capitalisation",
      "UNAUTHORIZED",
      "PiiArmorStamp verification requires a bound PiiArmorRedactionReceiptV1",
    );
  }
  let parsedBinding: PiiArmorStampBindingV1;
  try {
    parsedBinding = decodeStampBinding(binding);
  } catch {
    return privacyRefusal(
      "propose_capitalisation",
      "UNAUTHORIZED",
      "PiiArmorStamp receipt binding is missing or malformed",
    );
  }

  const receipt = parsedBinding.redactionReceipt;
  const { receiptDigest: claimedReceiptDigest, ...receiptBody } = receipt;
  const computedReceiptDigest = computePiiArmorRedactionReceiptDigest(receiptBody);
  if (claimedReceiptDigest !== computedReceiptDigest) {
    return privacyRefusal(
      "propose_capitalisation",
      "INVALID_DIGEST",
      "PII armor redaction receipt digest does not bind its canonical fields",
    );
  }

  const expected = policyRes.value;
  if (
    parsedStamp.redactionReceiptDigest !== computedReceiptDigest
    || parsedStamp.policyVersion !== expected.policyVersion
    || receipt.policyVersion !== expected.policyVersion
    || parsedStamp.d7BlacklistVersion !== expected.d7BlacklistVersion
    || receipt.d7BlacklistVersion !== expected.d7BlacklistVersion
    || receipt.d7BlacklistDigest !== expected.d7BlacklistDigest
    || receipt.sourceScopeRef !== parsedBinding.sourceScopeRef
    || receipt.targetScopeRef !== parsedBinding.targetScopeRef
    || receipt.boundary !== parsedBinding.boundary
    || receipt.authorizationReceiptDigest !== parsedBinding.authorizationReceiptDigest
    || receipt.outputPayloadDigest !== parsedBinding.payloadDigest
  ) {
    return privacyRefusal(
      "propose_capitalisation",
      "UNAUTHORIZED",
      "PiiArmorStamp does not match the active privacy policy or call binding",
    );
  }
  return { ok: true, value: parsedStamp };
}

export async function redactWithPiiArmorV1(
  input: PiiArmorRedactionInputV1,
): Promise<Result<PiiArmorRedactionOutputV1>> {
  let envelope: Record<string, unknown>;
  try {
    envelope = decodeStrictShallowEnvelope(
      input,
      "piiArmorRedactionInput",
      [
        "authorizationPort",
        "request",
        "denyList",
        "policyVersion",
        "boundary",
        "d33Pseudonymized",
        "actorPseudoId",
        "sessionPseudoId",
        "termSalt",
      ],
      [
        "authorizationPort",
        "request",
        "denyList",
        "policyVersion",
        "boundary",
        "d33Pseudonymized",
      ],
    );
  } catch (error) {
    return privacyRefusal(
      "propose_capitalisation",
      "INVALID_SCHEMA",
      error instanceof SchemaFailure ? error.message : "PII armor redaction input is invalid",
    );
  }

  let authPort: AuthorizationPort | undefined;
  try {
    const candidatePort = envelope.authorizationPort as AuthorizationPort | undefined;
    if (
      candidatePort === null
      || candidatePort === undefined
      || typeof candidatePort !== "object"
      || candidatePort.version !== 1
      || typeof candidatePort.redact !== "function"
    ) {
      return privacyRefusal(
        "propose_capitalisation",
        "CAPABILITY_UNAVAILABLE",
        "AuthorizationPort.redact is unavailable",
      );
    }
    authPort = candidatePort;
  } catch {
    return privacyRefusal(
      "propose_capitalisation",
      "CAPABILITY_UNAVAILABLE",
      "AuthorizationPort.redact is unavailable",
    );
  }

  const denyListRes = validateConfidentialityDenyListV1(envelope.denyList);
  if (!denyListRes.ok) {
    return {
      ok: false,
      error: { ...denyListRes.error, operation: "propose_capitalisation" },
    };
  }

  let policyVersion: string;
  let crossBoundary: CrossBoundaryEgressKindV1;
  let d33Pseudonymized: boolean;
  let actorPseudoId: string | undefined;
  let sessionPseudoId: string | undefined;
  let termSalt: string | undefined;
  let reqObj: Record<string, unknown>;
  let targetScopeRef: OpaqueRef;
  let authzReceiptDigest: Digest;
  let directive: RedactionDirectiveV1;
  try {
    const meta = decodeStrictObject(
      {
        policyVersion: envelope.policyVersion,
        boundary: envelope.boundary,
        d33Pseudonymized: envelope.d33Pseudonymized,
        ...(Object.hasOwn(envelope, "actorPseudoId") ? { actorPseudoId: envelope.actorPseudoId } : {}),
        ...(Object.hasOwn(envelope, "sessionPseudoId") ? { sessionPseudoId: envelope.sessionPseudoId } : {}),
        ...(Object.hasOwn(envelope, "termSalt") ? { termSalt: envelope.termSalt } : {}),
      },
      "piiArmorMetadata",
      ["policyVersion", "boundary", "d33Pseudonymized", "actorPseudoId", "sessionPseudoId", "termSalt"],
      ["policyVersion", "boundary", "d33Pseudonymized"],
    );
    assertOpaque(meta.policyVersion, "policyVersion");
    policyVersion = meta.policyVersion;
    if (!isCrossBoundary(meta.boundary)) {
      throw new SchemaFailure("boundary must be a cross-boundary egress kind");
    }
    crossBoundary = meta.boundary;
    if (typeof meta.d33Pseudonymized !== "boolean") {
      throw new SchemaFailure("d33Pseudonymized must be a boolean");
    }
    d33Pseudonymized = meta.d33Pseudonymized;
    if (Object.hasOwn(meta, "actorPseudoId")) {
      assertOpaque(meta.actorPseudoId, "actorPseudoId");
      actorPseudoId = meta.actorPseudoId;
    }
    if (Object.hasOwn(meta, "sessionPseudoId")) {
      assertOpaque(meta.sessionPseudoId, "sessionPseudoId");
      sessionPseudoId = meta.sessionPseudoId;
    }
    if (Object.hasOwn(meta, "termSalt")) {
      assertOpaque(meta.termSalt, "termSalt");
      termSalt = meta.termSalt;
    }
    reqObj = decodeStrictObject(
      envelope.request,
      "redactionRequest",
      ["source_record", "target_scope_ref", "directive", "authorization_receipt_digest"],
      ["source_record", "target_scope_ref", "directive", "authorization_receipt_digest"],
    );
    targetScopeRef = assertNonBlankRef(reqObj.target_scope_ref, "request.target_scope_ref");
    assertDigest(reqObj.authorization_receipt_digest, "request.authorization_receipt_digest");
    authzReceiptDigest = reqObj.authorization_receipt_digest;
    directive = decodeRedactionDirectiveStrict(reqObj.directive);
  } catch (error) {
    return privacyRefusal(
      "propose_capitalisation",
      "INVALID_SCHEMA",
      error instanceof SchemaFailure ? error.message : "PII armor request is invalid",
    );
  }

  if (
    !d33Pseudonymized
    || (actorPseudoId !== undefined && !isActorPseudonymV1(actorPseudoId))
    || (sessionPseudoId !== undefined && !isSessionPseudonymV1(sessionPseudoId))
  ) {
    return privacyRefusal(
      "propose_capitalisation",
      "UNAUTHORIZED",
      "PII armor requires D33 pseudonymized identities",
    );
  }

  const validSource = validateMemoryRecord(reqObj.source_record);
  if (!validSource.ok) {
    return {
      ok: false,
      error: { ...validSource.error, operation: "propose_capitalisation" },
    };
  }
  let sourceScopeRef: OpaqueRef;
  try {
    sourceScopeRef = assertNonBlankRef(validSource.value.record.scope_ref, "source_record.scope_ref");
  } catch (error) {
    return privacyRefusal(
      "propose_capitalisation",
      "INVALID_SCHEMA",
      error instanceof SchemaFailure ? error.message : "source_record.scope_ref is invalid",
    );
  }
  if (denyListRes.value.saltedTermHashes.length > 0 && termSalt === undefined) {
    return privacyRefusal(
      "propose_capitalisation",
      "POLICY_UNAVAILABLE",
      "salted deny-list screening requires termSalt",
    );
  }
  const redactionRequest: RedactionRequestV1 = {
    source_record: validSource.value.record,
    target_scope_ref: targetScopeRef,
    directive,
    authorization_receipt_digest: authzReceiptDigest,
  };

  let portRedacted: Result<RedactionResultV1>;
  try {
    portRedacted = await authPort.redact(redactionRequest);
  } catch {
    return privacyRefusal(
      "propose_capitalisation",
      "POLICY_UNAVAILABLE",
      "AuthorizationPort.redact failed",
    );
  }
  if (!portRedacted || typeof portRedacted !== "object" || portRedacted.ok !== true) {
    return normalizePortRedactionFailure(portRedacted);
  }

  let rawResult: Record<string, unknown>;
  try {
    rawResult = decodeStrictObject(
      portRedacted.value,
      "redactionResult",
      ["payload", "source_record_digest", "output_payload_digest", "policy_version", "receipt_digest"],
      ["payload", "source_record_digest", "output_payload_digest", "policy_version", "receipt_digest"],
    );
    assertDigest(rawResult.source_record_digest, "redactionResult.source_record_digest");
    assertDigest(rawResult.output_payload_digest, "redactionResult.output_payload_digest");
    assertOpaque(rawResult.policy_version, "redactionResult.policy_version");
    assertDigest(rawResult.receipt_digest, "redactionResult.receipt_digest");
  } catch {
    return privacyRefusal(
      "propose_capitalisation",
      "INVALID_SCHEMA",
      "AuthorizationPort.redact returned a malformed redaction result",
    );
  }

  if (rawResult.policy_version !== policyVersion) {
    return privacyRefusal(
      "propose_capitalisation",
      "POLICY_STALE",
      "redaction policy_version does not match the active armor policy",
    );
  }
  if (rawResult.source_record_digest !== validSource.value.record_digest) {
    return privacyRefusal(
      "propose_capitalisation",
      "INVALID_DIGEST",
      "redaction source_record_digest does not bind the source record",
    );
  }

  const validPayload = validateCandidatePayload(rawResult.payload);
  if (!validPayload.ok) {
    return {
      ok: false,
      error: { ...validPayload.error, operation: "propose_capitalisation" },
    };
  }
  const expectedOutputDigest = knowledgePayloadDigest(validPayload.value.payload);
  if (rawResult.output_payload_digest !== expectedOutputDigest) {
    return privacyRefusal(
      "propose_capitalisation",
      "INVALID_DIGEST",
      "redaction output_payload_digest does not bind the redacted payload",
    );
  }

  const bounded = applyPortOwnedRedaction(validPayload.value.payload, directive);
  if (!bounded.ok) {
    return {
      ok: false,
      error: { ...bounded.error, operation: "propose_capitalisation" },
    };
  }
  const canonicalPayload = canonicalizeJcs(validPayload.value.payload);
  if (canonicalizeJcs(bounded.value) !== canonicalPayload) {
    return privacyRefusal(
      "propose_capitalisation",
      "UNAUTHORIZED",
      "redacted payload retained fields disallowed by RedactionDirectiveV1",
    );
  }
  const packetBytes = utf8ByteLength(canonicalPayload);

  const screened = screenForDenyListV1(
    denyListRes.value,
    validPayload.value.payload,
    termSalt === undefined ? undefined : { termSalt },
  );
  if (!screened.ok) {
    return {
      ok: false,
      error: { ...screened.error, operation: "propose_capitalisation" },
    };
  }
  if (!screened.value.allowed) {
    return privacyRefusal(
      "propose_capitalisation",
      "UNAUTHORIZED",
      "redacted extract hit D7 confidentiality deny-list",
    );
  }

  const redaction: RedactionResultV1 = {
    payload: validPayload.value.payload,
    source_record_digest: rawResult.source_record_digest as Digest,
    output_payload_digest: expectedOutputDigest,
    policy_version: policyVersion,
    receipt_digest: rawResult.receipt_digest as Digest,
  };
  const receiptBody: Omit<PiiArmorRedactionReceiptV1, "receiptDigest"> = {
    policyVersion,
    d7BlacklistVersion: denyListRes.value.version,
    d7BlacklistDigest: denyListRes.value.digestSha256,
    sourceScopeRef,
    targetScopeRef,
    boundary: crossBoundary,
    authorizationReceiptDigest: authzReceiptDigest,
    sourceRecordDigest: validSource.value.record_digest,
    portRedactionReceiptDigest: redaction.receipt_digest,
    outputPayloadDigest: expectedOutputDigest,
    d33Pseudonymized: true,
  };
  const redactionReceiptDigest = computePiiArmorRedactionReceiptDigest(receiptBody);
  const redactionReceipt: PiiArmorRedactionReceiptV1 = {
    ...receiptBody,
    receiptDigest: redactionReceiptDigest,
  };
  const stamp: PiiArmorStampV1 = {
    policyVersion,
    redactionReceiptDigest,
    d7BlacklistVersion: denyListRes.value.version,
    d33Pseudonymized: true,
  };
  return {
    ok: true,
    value: { redaction, redactionReceipt, stamp, packetBytes },
  };
}

export function evaluateEgressBoundaryV1(
  input: EgressBoundaryRequestV1,
): Result<EgressBoundaryDecisionV1> {
  let obj: Record<string, unknown>;
  try {
    obj = decodeStrictObject(
      input,
      "egressBoundaryRequest",
      [
        "boundary",
        "metamodelClass",
        "sourceScopeRef",
        "targetScopeRef",
        "authorizationReceiptDigest",
        "payloadDigest",
        "piiArmorStamp",
        "redactionReceipt",
        "expectedPolicy",
        "packetBytes",
        "maxPacketBytes",
        "workspaceSyncEnabled",
        "contentPolicyAllowsSync",
        "turnTextBytes",
        "mandateAllowsContextTransfer",
        "repoPolicyAllowsContextTransfer",
      ],
      ["boundary", "metamodelClass"],
    );
  } catch (error) {
    return privacyRefusal(
      "propose_capitalisation",
      "INVALID_SCHEMA",
      error instanceof SchemaFailure ? error.message : "egress boundary request is invalid",
    );
  }

  if (!isEgressBoundary(obj.boundary) || !isEgressClass(obj.metamodelClass)) {
    return privacyRefusal(
      "propose_capitalisation",
      "INVALID_SCHEMA",
      "unknown egress boundary or metamodel class",
    );
  }

  if (obj.boundary !== "same-workspace-sync") {
    const hasCompleteBinding =
      Object.hasOwn(obj, "redactionReceipt")
      && obj.redactionReceipt !== null
      && Object.hasOwn(obj, "sourceScopeRef")
      && Object.hasOwn(obj, "targetScopeRef")
      && Object.hasOwn(obj, "authorizationReceiptDigest")
      && Object.hasOwn(obj, "payloadDigest");
    const binding = hasCompleteBinding
      ? {
          redactionReceipt: obj.redactionReceipt,
          sourceScopeRef: obj.sourceScopeRef,
          targetScopeRef: obj.targetScopeRef,
          boundary: obj.boundary,
          authorizationReceiptDigest: obj.authorizationReceiptDigest,
          payloadDigest: obj.payloadDigest,
        }
      : undefined;
    const verifiedStamp = verifyPiiArmorStampV1(obj.piiArmorStamp, obj.expectedPolicy, binding);
    if (!verifiedStamp.ok) {
      return verifiedStamp;
    }
    try {
      if (!Object.hasOwn(obj, "packetBytes") || !Object.hasOwn(obj, "maxPacketBytes")) {
        throw new SchemaFailure("cross-boundary egress requires packetBytes and maxPacketBytes");
      }
      assertSafeEpoch(obj.packetBytes, "packetBytes");
      assertSafeEpoch(obj.maxPacketBytes, "maxPacketBytes");
      if (obj.packetBytes < 0 || obj.maxPacketBytes < 1) {
        throw new SchemaFailure("packet byte bounds must be valid positive integers");
      }
    } catch (error) {
      return privacyRefusal(
        "propose_capitalisation",
        "INVALID_SCHEMA",
        error instanceof SchemaFailure ? error.message : "invalid packet byte bounds",
      );
    }
    if ((obj.packetBytes as number) > (obj.maxPacketBytes as number)) {
      return privacyRefusal(
        "propose_capitalisation",
        "UNAUTHORIZED",
        "cross-boundary packet exceeds maxPacketBytes",
      );
    }
    return {
      ok: true,
      value: {
        permitted: true,
        crossesBoundary: true,
        mode: "pii-armored",
        stamp: verifiedStamp.value,
      },
    };
  }

  if (obj.workspaceSyncEnabled !== true) {
    return privacyRefusal(
      "propose_capitalisation",
      "UNAUTHORIZED",
      "same-workspace replication is disabled",
    );
  }

  if (obj.metamodelClass === "context_log" || obj.metamodelClass === "context_summary") {
    if (obj.mandateAllowsContextTransfer !== true || obj.repoPolicyAllowsContextTransfer !== true) {
      return privacyRefusal(
        "propose_capitalisation",
        "UNAUTHORIZED",
        "context records stay local by default unless both mandate and repository policy permit transfer",
      );
    }
    return {
      ok: true,
      value: {
        permitted: true,
        crossesBoundary: false,
        mode: "mandated-context-transfer",
      },
    };
  }

  if (obj.metamodelClass === "turn_text") {
    if (obj.contentPolicyAllowsSync !== true) {
      return privacyRefusal(
        "propose_capitalisation",
        "UNAUTHORIZED",
        "unconsented turn_text remains local-only",
      );
    }
    try {
      if (!Object.hasOwn(obj, "turnTextBytes")) {
        throw new SchemaFailure("same-workspace-sync of turn_text requires turnTextBytes");
      }
      assertSafeEpoch(obj.turnTextBytes, "turnTextBytes");
      if (obj.turnTextBytes < 0) {
        throw new SchemaFailure("turnTextBytes must be non-negative");
      }
    } catch (error) {
      return privacyRefusal(
        "propose_capitalisation",
        "INVALID_SCHEMA",
        error instanceof SchemaFailure ? error.message : "turnTextBytes is invalid",
      );
    }
    if ((obj.turnTextBytes as number) > MAX_SYNC_TURN_TEXT_BYTES) {
      return privacyRefusal(
        "propose_capitalisation",
        "PROJECTION_OVERSIZED",
        "turn_text exceeds 65536 byte bound",
      );
    }
  }

  return {
    ok: true,
    value: {
      permitted: true,
      crossesBoundary: false,
      mode: "integral-unmasked",
    },
  };
}
