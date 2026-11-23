import { canonicalizeJcs } from "../canonical-json.js";
import type {
  ActivityIngestionReceiptV1,
  ActivityIngestionRequestV1,
  AdminEpochReceiptV1,
  AdminOperationRequestV1,
  AdmissionOutcomeV1,
  AdmissionRequestV1,
  AuthorizationContextV1,
  AuthorizationPort,
  AuthorizationRequestV1,
  AuthorizationResourceV1,
  AuthorizationResultV1,
  AuthorizationRevalidationV1,
  CandidatePayloadV2,
  CapabilityDescriptorV1,
  CapitalisationRequestV1,
  CaptureAcknowledgementV1,
  CaptureRequestV2,
  Cursor,
  Digest,
  Instant,
  LifecycleCommandV1,
  LifecycleReceiptV1,
  MemoryErrorCode,
  MemoryOperation,
  MemoryPortV2,
  OpaqueRef,
  OperationalCapabilityReceiptV1,
  ProjectionInvalidationReceiptV1,
  ProjectionInvalidationRequestV1,
  RecallPacketV2,
  RecallRequestV2,
  ReconciliationOutcomeV1,
  ReconciliationRequestV1,
  RedactionRequestV1,
  RedactionResultV1,
  Result,
} from "../contracts/index.js";
import { authorizationResourceDigest, receiptDigest } from "../digests.js";
import {
  assertDigest,
  assertInstant,
  assertOpaque,
  assertString,
  isCanonicalCursor,
  SchemaFailure,
  validateActivityIngestionRequest,
  validateCandidatePayload,
} from "../validation.js";
import {
  verifyPiiArmorStampV1,
  type PiiArmorExpectedPolicyV1,
  type PiiArmorRedactionReceiptV1,
  type PiiArmorStampV1,
} from "./pii-armor.js";
import {
  decodeStrictJsonValue,
  decodeStrictObject,
  decodeStrictShallowEnvelope,
  isSessionPseudonymV1,
  privacyRefusal,
} from "./pseudonym.js";

export const CAPTURE_PURPOSES_V1 = [
  "memory.capture.session/v1",
  "memory.capture.hmi/v1",
] as const;

export type CapturePurposeRefV1 = (typeof CAPTURE_PURPOSES_V1)[number];

export const RECALL_PURPOSES_V1 = [
  "memory.recall.contextual/v1",
  "memory.recall.study/v1",
] as const;

export type RecallPurposeRefV1 = (typeof RECALL_PURPOSES_V1)[number];

export type MemoryPrivacyPurposeRefV1 = CapturePurposeRefV1 | RecallPurposeRefV1;

export const STUDY_MAX_ACTIVE_PROJECTS = 30;
export const STUDY_SESSION_SLIDING_WINDOW_DAYS = 183;

const DAY_MS = 86_400_000;
const STUDY_WINDOW_MS = STUDY_SESSION_SLIDING_WINDOW_DAYS * DAY_MS;

const VALID_MEMORY_OPERATIONS: ReadonlySet<string> = new Set<MemoryOperation>([
  "capture",
  "cancel_capture",
  "request_admission",
  "reject",
  "withdraw",
  "dispute",
  "resolve_dispute",
  "expire",
  "supersede",
  "mark_non_current",
  "rewind",
  "trust_invalidate",
  "tombstone",
  "recall_current",
  "recall_history",
  "recall_disputed",
  "propose_capitalisation",
  "propose_reconciliation",
  "inspect_candidate",
  "projection_invalidate",
  "backup",
  "restore",
  "admin",
  "migrate",
]);

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

export interface StudyCorpusCalibrationPolicyV1 {
  readonly maxActiveProjects: 30;
  readonly sessionSlidingWindowDays: 183;
  readonly requirePiiArmor: true;
  readonly requirePseudonymized: true;
}

export const DEFAULT_STUDY_CORPUS_POLICY_V1: StudyCorpusCalibrationPolicyV1 = Object.freeze({
  maxActiveProjects: STUDY_MAX_ACTIVE_PROJECTS,
  sessionSlidingWindowDays: STUDY_SESSION_SLIDING_WINDOW_DAYS,
  requirePiiArmor: true,
  requirePseudonymized: true,
});

export interface StudyWindowItemV1 {
  readonly itemId: string;
  readonly projectId: string;
  readonly sessionPseudoId: string;
  readonly observedAt: Instant;
  readonly sourceScopeRef?: OpaqueRef;
  readonly payloadDigest?: Digest;
  readonly piiArmorStamp?: PiiArmorStampV1;
  readonly redactionReceipt?: PiiArmorRedactionReceiptV1;
}

export interface StudyWindowResultV1 {
  readonly purposeRef: RecallPurposeRefV1;
  readonly windowApplied: boolean;
  readonly asOf: Instant;
  readonly windowStart?: Instant;
  readonly activeProjectIds: readonly string[];
  readonly items: readonly StudyWindowItemV1[];
  readonly droppedByTimeWindowCount: number;
  readonly droppedByProjectCapCount: number;
}

export interface PurposeRevocationReceiptV1 {
  readonly scopeRef: OpaqueRef;
  readonly principalRef?: OpaqueRef;
  readonly revokedTargets: readonly MemoryPrivacyPurposeRefV1[];
  readonly revocationEpoch: Cursor;
  readonly revokedAt: Instant;
  readonly receiptDigest: Digest;
}

export interface WrapAuthorizationPortOptionsV1 {
  readonly resolvePrincipal?: (
    request: AuthorizationRequestV1,
  ) => Promise<Result<OpaqueRef | undefined>> | Result<OpaqueRef | undefined>;
}

export type MemoryPortPurposeInvocationV1 =
  | {
      readonly method: "capture";
      readonly operation: "capture";
      readonly scopeRef: OpaqueRef;
      readonly purposeRef: CapturePurposeRefV1;
      readonly authorization: AuthorizationContextV1;
      readonly request: CaptureRequestV2;
    }
  | {
      readonly method: "ingestActivity";
      readonly operation: "capture";
      readonly scopeRef: OpaqueRef;
      readonly purposeRef: CapturePurposeRefV1;
      readonly authorization: AuthorizationContextV1;
      readonly request: ActivityIngestionRequestV1;
    }
  | {
      readonly method: "recall";
      readonly operation: "recall_current";
      readonly scopeRef?: OpaqueRef;
      readonly purposeRef: RecallPurposeRefV1;
      readonly authorization: AuthorizationContextV1;
      readonly request: RecallRequestV2;
    }
  | {
      readonly method: "proposeCapitalisation";
      readonly operation: "propose_capitalisation";
      readonly scopeRef: OpaqueRef;
      readonly purposeRef: CapturePurposeRefV1;
      readonly authorization: AuthorizationContextV1;
      readonly request: CapitalisationRequestV1;
    };

export interface WrapMemoryPortOptionsV1 {
  readonly scopeRef?: OpaqueRef;
  readonly resolveScope?: (
    invocation: MemoryPortPurposeInvocationV1,
  ) => Promise<Result<OpaqueRef | undefined>> | Result<OpaqueRef | undefined>;
  readonly resolvePrincipal?: (
    invocation: MemoryPortPurposeInvocationV1,
  ) => Promise<Result<OpaqueRef | undefined>> | Result<OpaqueRef | undefined>;
}

export interface PurposeRevocationControllerV1 {
  revokePurpose(input: {
    readonly scopeRef: OpaqueRef;
    readonly purpose: MemoryPrivacyPurposeRefV1 | "memory.capture.*" | "memory.recall.*";
    readonly principalRef?: OpaqueRef;
    readonly revokedAt: Instant;
  }): Result<PurposeRevocationReceiptV1>;
  checkPurposeAuthorization(input: {
    readonly operation: "capture" | "recall";
    readonly scopeRef: OpaqueRef;
    readonly purposeRef: string;
    readonly principalRef?: OpaqueRef;
  }): Result<{
    readonly namespace: "capture" | "recall";
    readonly purposeRef: MemoryPrivacyPurposeRefV1;
    readonly revocationEpoch: Cursor;
  }>;
  wrapAuthorizationPort(
    inner: AuthorizationPort,
    options?: WrapAuthorizationPortOptionsV1,
  ): AuthorizationPort;
  wrapMemoryPort(
    inner: MemoryPortV2,
    options?: WrapMemoryPortOptionsV1,
  ): MemoryPortV2;
}

function assertRevocationRef(value: unknown, field: string): OpaqueRef {
  assertOpaque(value, field);
  if (value.trim().length === 0 || value.includes("\0")) {
    throw new SchemaFailure(`${field} must be non-blank without NUL bytes`);
  }
  return value;
}

export function classifyPurposeNamespaceV1(
  purposeRef: unknown,
): "capture" | "recall" | undefined {
  if (typeof purposeRef !== "string") {
    return undefined;
  }
  if ((CAPTURE_PURPOSES_V1 as readonly string[]).includes(purposeRef)) {
    return "capture";
  }
  if ((RECALL_PURPOSES_V1 as readonly string[]).includes(purposeRef)) {
    return "recall";
  }
  return undefined;
}

function decodeStudyPolicy(value: unknown): StudyCorpusCalibrationPolicyV1 {
  const obj = decodeStrictObject(
    value,
    "studyPolicy",
    ["maxActiveProjects", "sessionSlidingWindowDays", "requirePiiArmor", "requirePseudonymized"],
    ["maxActiveProjects", "sessionSlidingWindowDays", "requirePiiArmor", "requirePseudonymized"],
  );
  if (
    obj.maxActiveProjects !== STUDY_MAX_ACTIVE_PROJECTS
    || obj.sessionSlidingWindowDays !== STUDY_SESSION_SLIDING_WINDOW_DAYS
    || obj.requirePiiArmor !== true
    || obj.requirePseudonymized !== true
  ) {
    throw new SchemaFailure("study corpus calibration policy deviates from D9/D8/D33 fixed bounds");
  }
  return DEFAULT_STUDY_CORPUS_POLICY_V1;
}

function decodeStrictExpectedArmorPolicy(value: unknown): PiiArmorExpectedPolicyV1 {
  const obj = decodeStrictObject(
    value,
    "expectedArmorPolicy",
    ["policyVersion", "d7BlacklistVersion", "d7BlacklistDigest"],
    ["policyVersion", "d7BlacklistVersion", "d7BlacklistDigest"],
  );
  assertOpaque(obj.policyVersion, "expectedArmorPolicy.policyVersion");
  assertOpaque(obj.d7BlacklistVersion, "expectedArmorPolicy.d7BlacklistVersion");
  assertDigest(obj.d7BlacklistDigest, "expectedArmorPolicy.d7BlacklistDigest");
  return {
    policyVersion: obj.policyVersion,
    d7BlacklistVersion: obj.d7BlacklistVersion,
    d7BlacklistDigest: obj.d7BlacklistDigest,
  };
}

export function applyStudyWindowV1(input: {
  readonly purposeRef: string;
  readonly asOf: Instant;
  readonly items: readonly StudyWindowItemV1[];
  readonly policy?: StudyCorpusCalibrationPolicyV1;
  readonly targetScopeRef?: OpaqueRef;
  readonly authorizationReceiptDigest?: Digest;
  readonly expectedArmorPolicy?: PiiArmorExpectedPolicyV1;
}): Result<StudyWindowResultV1> {
  let obj: Record<string, unknown>;
  let asOf: Instant;
  let purposeRef: string;
  let rawItems: unknown[];
  let targetScopeRef: OpaqueRef | undefined;
  let authorizationReceiptDigest: Digest | undefined;
  let expectedArmorPolicy: PiiArmorExpectedPolicyV1 | undefined;
  try {
    obj = decodeStrictObject(
      input,
      "studyWindowInput",
      [
        "purposeRef",
        "asOf",
        "items",
        "policy",
        "targetScopeRef",
        "authorizationReceiptDigest",
        "expectedArmorPolicy",
      ],
      ["purposeRef", "asOf", "items"],
    );
    assertOpaque(obj.purposeRef, "purposeRef");
    purposeRef = obj.purposeRef;
    assertInstant(obj.asOf, "asOf");
    asOf = obj.asOf;
    if (!Array.isArray(obj.items)) {
      throw new SchemaFailure("items must be a dense array");
    }
    rawItems = obj.items;
    if (Object.hasOwn(obj, "policy")) {
      decodeStudyPolicy(obj.policy);
    }
    if (Object.hasOwn(obj, "targetScopeRef")) {
      targetScopeRef = assertRevocationRef(obj.targetScopeRef, "targetScopeRef");
    }
    if (Object.hasOwn(obj, "authorizationReceiptDigest")) {
      assertDigest(obj.authorizationReceiptDigest, "authorizationReceiptDigest");
      authorizationReceiptDigest = obj.authorizationReceiptDigest;
    }
    if (Object.hasOwn(obj, "expectedArmorPolicy") && obj.expectedArmorPolicy !== null) {
      expectedArmorPolicy = decodeStrictExpectedArmorPolicy(obj.expectedArmorPolicy);
    }
  } catch (error) {
    return privacyRefusal(
      "recall_current",
      "INVALID_SCHEMA",
      error instanceof SchemaFailure ? error.message : "study window input is invalid",
    );
  }

  const namespace = classifyPurposeNamespaceV1(purposeRef);
  if (namespace === undefined) {
    return privacyRefusal("recall_current", "INVALID_SCHEMA", "unknown recall purposeRef");
  }
  if (namespace === "capture") {
    return privacyRefusal(
      "recall_current",
      "UNAUTHORIZED",
      "capture purposeRef is not permitted on recall reads",
    );
  }

  const decodedItems: StudyWindowItemV1[] = [];
  for (let i = 0; i < rawItems.length; i += 1) {
    try {
      const itemObj = decodeStrictObject(
        rawItems[i],
        `items[${i}]`,
        [
          "itemId",
          "projectId",
          "sessionPseudoId",
          "observedAt",
          "sourceScopeRef",
          "payloadDigest",
          "piiArmorStamp",
          "redactionReceipt",
        ],
        ["itemId", "projectId", "sessionPseudoId", "observedAt"],
      );
      assertOpaque(itemObj.itemId, `items[${i}].itemId`);
      assertOpaque(itemObj.projectId, `items[${i}].projectId`);
      assertOpaque(itemObj.sessionPseudoId, `items[${i}].sessionPseudoId`);
      assertInstant(itemObj.observedAt, `items[${i}].observedAt`);
      let sourceScopeRef: OpaqueRef | undefined;
      if (Object.hasOwn(itemObj, "sourceScopeRef")) {
        sourceScopeRef = assertRevocationRef(itemObj.sourceScopeRef, `items[${i}].sourceScopeRef`);
      }
      let payloadDigest: Digest | undefined;
      if (Object.hasOwn(itemObj, "payloadDigest")) {
        assertDigest(itemObj.payloadDigest, `items[${i}].payloadDigest`);
        payloadDigest = itemObj.payloadDigest;
      }
      decodedItems.push({
        itemId: itemObj.itemId,
        projectId: itemObj.projectId,
        sessionPseudoId: itemObj.sessionPseudoId,
        observedAt: itemObj.observedAt,
        ...(sourceScopeRef === undefined ? {} : { sourceScopeRef }),
        ...(payloadDigest === undefined ? {} : { payloadDigest }),
        ...(Object.hasOwn(itemObj, "piiArmorStamp")
          ? { piiArmorStamp: itemObj.piiArmorStamp as unknown as PiiArmorStampV1 }
          : {}),
        ...(Object.hasOwn(itemObj, "redactionReceipt")
          ? { redactionReceipt: itemObj.redactionReceipt as unknown as PiiArmorRedactionReceiptV1 }
          : {}),
      });
    } catch (error) {
      return privacyRefusal(
        "recall_current",
        "INVALID_SCHEMA",
        error instanceof SchemaFailure ? error.message : "study window item is invalid",
      );
    }
  }

  // Hard Non-Truncation Invariant: D9 filters memory.recall.study/v1 ONLY.
  if (purposeRef === "memory.recall.contextual/v1") {
    const allProjects = [...new Set(decodedItems.map((item) => item.projectId))].sort();
    return {
      ok: true,
      value: {
        purposeRef: "memory.recall.contextual/v1",
        windowApplied: false,
        asOf,
        activeProjectIds: allProjects,
        items: decodedItems.map((item) => ({ ...item })),
        droppedByTimeWindowCount: 0,
        droppedByProjectCapCount: 0,
      },
    };
  }

  // memory.recall.study/v1 requires D8 PiiArmorStamp + bound receipt + D33 session pseudonyms on every item.
  if (expectedArmorPolicy === undefined) {
    return privacyRefusal(
      "recall_current",
      "POLICY_UNAVAILABLE",
      "study recall requires an active PII armor policy",
    );
  }
  if (targetScopeRef === undefined || authorizationReceiptDigest === undefined) {
    return privacyRefusal(
      "recall_current",
      "UNAUTHORIZED",
      "study recall requires active targetScopeRef and authorizationReceiptDigest bindings",
    );
  }
  const verifiedItems: StudyWindowItemV1[] = [];
  for (const item of decodedItems) {
    if (!isSessionPseudonymV1(item.sessionPseudoId)) {
      return privacyRefusal(
        "recall_current",
        "UNAUTHORIZED",
        "study recall requires D33 pseudonymized session identifiers",
      );
    }
    const itemBinding =
      item.redactionReceipt !== undefined
      && item.sourceScopeRef !== undefined
      && item.payloadDigest !== undefined
        ? {
            redactionReceipt: item.redactionReceipt,
            sourceScopeRef: item.sourceScopeRef,
            targetScopeRef,
            boundary: "study" as const,
            authorizationReceiptDigest,
            payloadDigest: item.payloadDigest,
          }
        : undefined;
    const stampCheck = verifyPiiArmorStampV1(
      item.piiArmorStamp,
      expectedArmorPolicy,
      itemBinding,
    );
    if (!stampCheck.ok) {
      return {
        ok: false,
        error: { ...stampCheck.error, operation: "recall_current" },
      };
    }
    verifiedItems.push({ ...item, piiArmorStamp: stampCheck.value });
  }

  const asOfMs = Date.parse(asOf);
  const windowStartMs = asOfMs - STUDY_WINDOW_MS;
  let windowStart: Instant;
  try {
    if (!Number.isSafeInteger(windowStartMs)) {
      throw new SchemaFailure("windowStart overflows safe instant range");
    }
    const candidateIso = new Date(windowStartMs).toISOString();
    assertInstant(candidateIso, "windowStart");
    windowStart = candidateIso;
  } catch (error) {
    return privacyRefusal(
      "recall_current",
      "INVALID_SCHEMA",
      error instanceof SchemaFailure ? error.message : "windowStart is outside valid Instant range",
    );
  }

  const inWindow: StudyWindowItemV1[] = [];
  let droppedByTimeWindowCount = 0;
  for (const item of verifiedItems) {
    const observedMs = Date.parse(item.observedAt);
    if (observedMs >= windowStartMs && observedMs <= asOfMs) {
      inWindow.push(item);
    } else {
      droppedByTimeWindowCount += 1;
    }
  }

  const latestByProject = new Map<string, number>();
  for (const item of inWindow) {
    const observedMs = Date.parse(item.observedAt);
    const prev = latestByProject.get(item.projectId);
    if (prev === undefined || observedMs > prev) {
      latestByProject.set(item.projectId, observedMs);
    }
  }
  const activeProjectIds = [...latestByProject.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, STUDY_MAX_ACTIVE_PROJECTS)
    .map(([projectId]) => projectId);
  const activeProjectSet = new Set(activeProjectIds);

  const kept: StudyWindowItemV1[] = [];
  let droppedByProjectCapCount = 0;
  for (const item of inWindow) {
    if (activeProjectSet.has(item.projectId)) {
      kept.push(item);
    } else {
      droppedByProjectCapCount += 1;
    }
  }

  return {
    ok: true,
    value: {
      purposeRef: "memory.recall.study/v1",
      windowApplied: true,
      asOf,
      windowStart,
      activeProjectIds,
      items: kept,
      droppedByTimeWindowCount,
      droppedByProjectCapCount,
    },
  };
}

function expandRevocationTargets(
  purpose: unknown,
): readonly MemoryPrivacyPurposeRefV1[] | undefined {
  if (purpose === "memory.capture.*") {
    return [...CAPTURE_PURPOSES_V1];
  }
  if (purpose === "memory.recall.*") {
    return [...RECALL_PURPOSES_V1];
  }
  if (classifyPurposeNamespaceV1(purpose) !== undefined) {
    return [purpose as MemoryPrivacyPurposeRefV1];
  }
  return undefined;
}

function isRecallOperation(op: MemoryOperation): boolean {
  return op === "recall_current" || op === "recall_history" || op === "recall_disputed";
}

function normalizeResolverFailure<T>(
  operation: MemoryOperation,
  result: unknown,
): Result<T> {
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
            operation,
            message: candidate.message,
            retryable: candidate.retryable,
          },
        };
      }
    }
  }
  return privacyRefusal(operation, "POLICY_UNAVAILABLE", "principal resolution failed");
}

function decodeStrictAuthorizationContext(
  raw: unknown,
  field: string,
): AuthorizationContextV1 {
  const ctxObj = decodeStrictObject(
    raw,
    field,
    ["credential", "context_ref"],
    ["credential"],
  );
  if (typeof ctxObj.credential !== "string") {
    throw new SchemaFailure(`${field}.credential must be a string`);
  }
  const decodedContext: AuthorizationContextV1 = { credential: ctxObj.credential };
  if (Object.hasOwn(ctxObj, "context_ref")) {
    assertOpaque(ctxObj.context_ref, `${field}.context_ref`);
    decodedContext.context_ref = ctxObj.context_ref;
  }
  return decodedContext;
}

function decodeStrictAuthorizationRequest(rawRequest: unknown): Result<{
  readonly request: AuthorizationRequestV1;
  readonly resourcePurposeRef?: OpaqueRef;
}> {
  let operation: MemoryOperation;
  let resource: AuthorizationResourceV1;
  let resourcePurposeRef: OpaqueRef | undefined;
  let resourceDigest: Digest;
  let context: AuthorizationContextV1;
  let issuedAt: Instant;
  let deadlineAt: Instant;
  try {
    const reqObj = decodeStrictObject(
      rawRequest,
      "authorizationRequest",
      ["operation", "resource", "resource_digest", "context", "issued_at", "deadline_at"],
      ["operation", "resource", "resource_digest", "context", "issued_at", "deadline_at"],
    );
    if (typeof reqObj.operation !== "string" || !VALID_MEMORY_OPERATIONS.has(reqObj.operation)) {
      throw new SchemaFailure("authorizationRequest.operation is unknown");
    }
    operation = reqObj.operation as MemoryOperation;

    const resObj = decodeStrictObject(
      reqObj.resource,
      "authorizationRequest.resource",
      ["scope_ref", "purpose_ref", "record_id", "candidate_id", "source_record_id", "target_scope_ref"],
      [],
    );
    const decodedResource: Record<string, OpaqueRef> = {};
    if (Object.hasOwn(resObj, "scope_ref")) {
      decodedResource.scope_ref = assertRevocationRef(resObj.scope_ref, "resource.scope_ref");
    }
    if (Object.hasOwn(resObj, "purpose_ref")) {
      resourcePurposeRef = assertRevocationRef(resObj.purpose_ref, "resource.purpose_ref");
      decodedResource.purpose_ref = resourcePurposeRef;
    }
    if (Object.hasOwn(resObj, "record_id")) {
      assertOpaque(resObj.record_id, "resource.record_id");
      decodedResource.record_id = resObj.record_id;
    }
    if (Object.hasOwn(resObj, "candidate_id")) {
      assertOpaque(resObj.candidate_id, "resource.candidate_id");
      decodedResource.candidate_id = resObj.candidate_id;
    }
    if (Object.hasOwn(resObj, "source_record_id")) {
      assertOpaque(resObj.source_record_id, "resource.source_record_id");
      decodedResource.source_record_id = resObj.source_record_id;
    }
    if (Object.hasOwn(resObj, "target_scope_ref")) {
      decodedResource.target_scope_ref = assertRevocationRef(
        resObj.target_scope_ref,
        "resource.target_scope_ref",
      );
    }
    resource = decodedResource as AuthorizationResourceV1;

    assertDigest(reqObj.resource_digest, "authorizationRequest.resource_digest");
    resourceDigest = reqObj.resource_digest;

    context = decodeStrictAuthorizationContext(reqObj.context, "authorizationRequest.context");

    assertInstant(reqObj.issued_at, "authorizationRequest.issued_at");
    issuedAt = reqObj.issued_at;
    assertInstant(reqObj.deadline_at, "authorizationRequest.deadline_at");
    deadlineAt = reqObj.deadline_at;
  } catch (error) {
    return privacyRefusal(
      "capture",
      "INVALID_SCHEMA",
      error instanceof SchemaFailure ? error.message : "authorization request is invalid",
    );
  }

  const expectedResourceDigest = authorizationResourceDigest(
    operation,
    resource as unknown as Record<string, unknown>,
  );
  if (resourceDigest !== expectedResourceDigest) {
    return privacyRefusal(
      operation,
      "INVALID_DIGEST",
      "authorization request resource_digest does not bind its resource",
    );
  }

  return {
    ok: true,
    value: {
      request: {
        operation,
        resource,
        resource_digest: resourceDigest,
        context,
        issued_at: issuedAt,
        deadline_at: deadlineAt,
      },
      ...(resourcePurposeRef === undefined ? {} : { resourcePurposeRef }),
    },
  };
}

function decodeStrictCaptureRequest(rawRequest: unknown): Result<{
  readonly request: CaptureRequestV2;
  readonly scopeRef: OpaqueRef;
  readonly purposeRef: OpaqueRef;
}> {
  let reqObj: Record<string, unknown>;
  let idempotencyKey: string;
  let deadlineAt: Instant;
  let cancellationRef: OpaqueRef;
  let sourceOrder: { readonly source_ref: OpaqueRef; readonly sequence: Cursor };
  let authorization: AuthorizationContextV1;
  let evidence: CaptureRequestV2["evidence"];
  try {
    reqObj = decodeStrictObject(
      rawRequest,
      "captureRequest",
      [
        "schema_version",
        "idempotency_key",
        "payload",
        "evidence",
        "authorization",
        "source_order",
        "deadline_at",
        "cancellation_ref",
      ],
      [
        "schema_version",
        "idempotency_key",
        "payload",
        "evidence",
        "authorization",
        "source_order",
        "deadline_at",
        "cancellation_ref",
      ],
    );
    if (reqObj.schema_version !== 2) {
      throw new SchemaFailure("captureRequest.schema_version must be 2");
    }
    assertString(reqObj.idempotency_key, "captureRequest.idempotency_key", 16, 512);
    idempotencyKey = reqObj.idempotency_key;
    assertInstant(reqObj.deadline_at, "captureRequest.deadline_at");
    deadlineAt = reqObj.deadline_at;
    assertOpaque(reqObj.cancellation_ref, "captureRequest.cancellation_ref");
    cancellationRef = reqObj.cancellation_ref;

    const orderObj = decodeStrictObject(
      reqObj.source_order,
      "captureRequest.source_order",
      ["source_ref", "sequence"],
      ["source_ref", "sequence"],
    );
    assertOpaque(orderObj.source_ref, "captureRequest.source_order.source_ref");
    if (!isCanonicalCursor(orderObj.sequence)) {
      throw new SchemaFailure("captureRequest.source_order.sequence must be a canonical cursor");
    }
    sourceOrder = {
      source_ref: orderObj.source_ref,
      sequence: orderObj.sequence,
    };

    authorization = decodeStrictAuthorizationContext(
      reqObj.authorization,
      "captureRequest.authorization",
    );

    const evObj = decodeStrictObject(
      reqObj.evidence,
      "captureRequest.evidence",
      ["evidence_ref", "evidence_digest", "citation_ids", "attestation"],
      ["evidence_ref", "evidence_digest", "citation_ids"],
    );
    assertOpaque(evObj.evidence_ref, "captureRequest.evidence.evidence_ref");
    assertDigest(evObj.evidence_digest, "captureRequest.evidence.evidence_digest");
    if (!Array.isArray(evObj.citation_ids)) {
      throw new SchemaFailure("captureRequest.evidence.citation_ids must be an array");
    }
    const citationIds: string[] = [];
    for (let i = 0; i < evObj.citation_ids.length; i += 1) {
      const cit = evObj.citation_ids[i];
      assertOpaque(cit, `captureRequest.evidence.citation_ids[${i}]`);
      citationIds.push(cit);
    }
    let attestation: string | undefined;
    if (Object.hasOwn(evObj, "attestation")) {
      if (typeof evObj.attestation !== "string") {
        throw new SchemaFailure("captureRequest.evidence.attestation must be a string");
      }
      attestation = evObj.attestation;
    }
    evidence = {
      evidence_ref: evObj.evidence_ref,
      evidence_digest: evObj.evidence_digest,
      citation_ids: citationIds,
      ...(attestation === undefined ? {} : { attestation }),
    };
  } catch (error) {
    return privacyRefusal(
      "capture",
      "INVALID_SCHEMA",
      error instanceof SchemaFailure ? error.message : "capture request is invalid",
    );
  }

  const validatedPayload = validateCandidatePayload(reqObj.payload);
  if (!validatedPayload.ok) {
    return { ok: false, error: { ...validatedPayload.error, operation: "capture" } };
  }

  let scopeRef: OpaqueRef;
  let purposeRef: OpaqueRef;
  try {
    scopeRef = assertRevocationRef(validatedPayload.value.payload.scope_ref, "captureRequest.payload.scope_ref");
    purposeRef = assertRevocationRef(validatedPayload.value.payload.purpose_ref, "captureRequest.payload.purpose_ref");
  } catch (error) {
    return privacyRefusal(
      "capture",
      "INVALID_SCHEMA",
      error instanceof SchemaFailure ? error.message : "capture payload scope or purpose is invalid",
    );
  }

  return {
    ok: true,
    value: {
      request: {
        schema_version: 2,
        idempotency_key: idempotencyKey,
        payload: validatedPayload.value.payload,
        evidence,
        authorization,
        source_order: { ...sourceOrder },
        deadline_at: deadlineAt,
        cancellation_ref: cancellationRef,
      },
      scopeRef,
      purposeRef,
    },
  };
}

function decodeStrictActivityIngestionRequest(rawRequest: unknown): Result<{
  readonly request: ActivityIngestionRequestV1;
  readonly scopeRef: OpaqueRef;
  readonly purposeRef: OpaqueRef;
}> {
  let strict: unknown;
  try {
    strict = decodeStrictJsonValue(rawRequest);
  } catch (error) {
    return privacyRefusal(
      "capture",
      "INVALID_SCHEMA",
      error instanceof SchemaFailure ? error.message : "activity ingestion request is invalid",
    );
  }
  const validated = validateActivityIngestionRequest(strict);
  if (!validated.ok) {
    return { ok: false, error: { ...validated.error, operation: "capture" } };
  }
  try {
    const scopeRef = assertRevocationRef(validated.value.scope_ref, "activityIngestionRequest.scope_ref");
    const purposeRef = assertRevocationRef(validated.value.purpose_ref, "activityIngestionRequest.purpose_ref");
    return {
      ok: true,
      value: {
        request: validated.value,
        scopeRef,
        purposeRef,
      },
    };
  } catch (error) {
    return privacyRefusal(
      "capture",
      "INVALID_SCHEMA",
      error instanceof SchemaFailure ? error.message : "activity ingestion scope or purpose is invalid",
    );
  }
}

function decodeStrictRecallRequest(rawRequest: unknown): Result<{
  readonly request: RecallRequestV2;
  readonly purposeRef: OpaqueRef;
}> {
  try {
    const reqObj = decodeStrictObject(
      rawRequest,
      "recallRequest",
      ["query", "purpose_ref", "as_of", "authorization", "capability_policy", "budgets", "page"],
      ["query", "purpose_ref", "authorization", "capability_policy", "budgets"],
    );
    assertString(reqObj.query, "recallRequest.query", 1, 8_192);
    const purposeRef = assertRevocationRef(reqObj.purpose_ref, "recallRequest.purpose_ref");
    const authorization = decodeStrictAuthorizationContext(
      reqObj.authorization,
      "recallRequest.authorization",
    );
    const policyObj = decodeStrictObject(
      reqObj.capability_policy,
      "recallRequest.capability_policy",
      ["minimum_channels", "network"],
      ["minimum_channels", "network"],
    );
    if (
      (policyObj.minimum_channels !== "lexical" && policyObj.minimum_channels !== "lexical_and_semantic")
      || (policyObj.network !== "forbid" && policyObj.network !== "allow")
    ) {
      throw new SchemaFailure("recallRequest.capability_policy is invalid");
    }
    const budgetsObj = decodeStrictObject(
      reqObj.budgets,
      "recallRequest.budgets",
      ["max_candidates", "max_results", "max_packet_bytes", "deadline_at"],
      ["max_candidates", "max_results", "max_packet_bytes", "deadline_at"],
    );
    const inRange = (val: unknown, min: number, max: number): val is number =>
      typeof val === "number" && Number.isSafeInteger(val) && val >= min && val <= max;
    if (
      !inRange(budgetsObj.max_candidates, 1, 2_000)
      || !inRange(budgetsObj.max_results, 1, 100)
      || !inRange(budgetsObj.max_packet_bytes, 1, 1_048_576)
    ) {
      throw new SchemaFailure("recallRequest.budgets are out of bounds");
    }
    assertInstant(budgetsObj.deadline_at, "recallRequest.budgets.deadline_at");

    let asOf: RecallRequestV2["as_of"];
    if (Object.hasOwn(reqObj, "as_of")) {
      const asOfObj = decodeStrictObject(
        reqObj.as_of,
        "recallRequest.as_of",
        ["valid_time", "system_cursor"],
        [],
      );
      const parsedAsOf: { valid_time?: number; system_cursor?: Cursor } = {};
      if (Object.hasOwn(asOfObj, "valid_time")) {
        if (typeof asOfObj.valid_time !== "number" || !Number.isSafeInteger(asOfObj.valid_time)) {
          throw new SchemaFailure("recallRequest.as_of.valid_time must be a safe integer");
        }
        parsedAsOf.valid_time = asOfObj.valid_time;
      }
      if (Object.hasOwn(asOfObj, "system_cursor")) {
        if (!isCanonicalCursor(asOfObj.system_cursor)) {
          throw new SchemaFailure("recallRequest.as_of.system_cursor must be a canonical cursor");
        }
        parsedAsOf.system_cursor = asOfObj.system_cursor;
      }
      asOf = parsedAsOf;
    }

    let page: RecallRequestV2["page"];
    if (Object.hasOwn(reqObj, "page")) {
      const pageObj = decodeStrictObject(
        reqObj.page,
        "recallRequest.page",
        ["size", "cursor"],
        ["size"],
      );
      if (!inRange(pageObj.size, 1, 50)) {
        throw new SchemaFailure("recallRequest.page.size is out of bounds");
      }
      const parsedPage: { size: number; cursor?: OpaqueRef } = { size: pageObj.size };
      if (Object.hasOwn(pageObj, "cursor")) {
        assertOpaque(pageObj.cursor, "recallRequest.page.cursor");
        parsedPage.cursor = pageObj.cursor;
      }
      page = parsedPage;
    }

    const request: RecallRequestV2 = {
      query: reqObj.query,
      purpose_ref: purposeRef,
      authorization,
      capability_policy: {
        minimum_channels: policyObj.minimum_channels,
        network: policyObj.network,
      },
      budgets: {
        max_candidates: budgetsObj.max_candidates,
        max_results: budgetsObj.max_results,
        max_packet_bytes: budgetsObj.max_packet_bytes,
        deadline_at: budgetsObj.deadline_at,
      },
      ...(asOf === undefined ? {} : { as_of: asOf }),
      ...(page === undefined ? {} : { page }),
    };
    return { ok: true, value: { request, purposeRef } };
  } catch (error) {
    return privacyRefusal(
      "recall_current",
      "INVALID_SCHEMA",
      error instanceof SchemaFailure ? error.message : "recall request is invalid",
    );
  }
}

function decodeStrictCapitalisationRequest(rawRequest: unknown): Result<{
  readonly request: CapitalisationRequestV1;
  readonly targetScopeRef: OpaqueRef;
  readonly purposeRef: OpaqueRef;
}> {
  try {
    const reqObj = decodeStrictObject(
      rawRequest,
      "capitalisationRequest",
      [
        "idempotency_key",
        "source_record_id",
        "target_scope_ref",
        "purpose_ref",
        "retention",
        "authorization",
        "deadline_at",
      ],
      [
        "idempotency_key",
        "source_record_id",
        "target_scope_ref",
        "purpose_ref",
        "retention",
        "authorization",
        "deadline_at",
      ],
    );
    assertString(reqObj.idempotency_key, "capitalisationRequest.idempotency_key", 16, 512);
    assertOpaque(reqObj.source_record_id, "capitalisationRequest.source_record_id");
    const targetScopeRef = assertRevocationRef(
      reqObj.target_scope_ref,
      "capitalisationRequest.target_scope_ref",
    );
    const purposeRef = assertRevocationRef(
      reqObj.purpose_ref,
      "capitalisationRequest.purpose_ref",
    );
    const retentionObj = decodeStrictObject(
      reqObj.retention,
      "capitalisationRequest.retention",
      ["expires_at", "derivative_rule"],
      ["derivative_rule"],
    );
    if (
      retentionObj.derivative_rule !== "retain"
      && retentionObj.derivative_rule !== "make-ineligible"
    ) {
      throw new SchemaFailure("capitalisationRequest.retention.derivative_rule is invalid");
    }
    let expiresAt: Instant | undefined;
    if (Object.hasOwn(retentionObj, "expires_at")) {
      assertInstant(retentionObj.expires_at, "capitalisationRequest.retention.expires_at");
      expiresAt = retentionObj.expires_at;
    }
    const authorization = decodeStrictAuthorizationContext(
      reqObj.authorization,
      "capitalisationRequest.authorization",
    );
    assertInstant(reqObj.deadline_at, "capitalisationRequest.deadline_at");

    const request: CapitalisationRequestV1 = {
      idempotency_key: reqObj.idempotency_key,
      source_record_id: reqObj.source_record_id,
      target_scope_ref: targetScopeRef,
      purpose_ref: purposeRef,
      retention: {
        derivative_rule: retentionObj.derivative_rule,
        ...(expiresAt === undefined ? {} : { expires_at: expiresAt }),
      },
      authorization,
      deadline_at: reqObj.deadline_at,
    };
    return { ok: true, value: { request, targetScopeRef, purposeRef } };
  } catch (error) {
    return privacyRefusal(
      "propose_capitalisation",
      "INVALID_SCHEMA",
      error instanceof SchemaFailure ? error.message : "capitalisation request is invalid",
    );
  }
}

interface ActiveDecoratorFrame {
  readonly kind: "capture" | "ingest_activity" | "recall" | "propose_capitalisation";
  readonly purposeRef: MemoryPrivacyPurposeRefV1;
  readonly scopeRef?: OpaqueRef;
  readonly principalRef?: OpaqueRef;
  readonly frameKey: string;
  verifiedByWrappedAuth: boolean;
}

interface InternalControllerBridge {
  readonly runWithDecoratorFrame: <T>(
    frame: ActiveDecoratorFrame,
    fn: () => Promise<T>,
  ) => Promise<T>;
  readonly hasAnyRevocationForPurpose: (purposeRef: MemoryPrivacyPurposeRefV1) => boolean;
}

const controllerBridges = new WeakMap<PurposeRevocationControllerV1, InternalControllerBridge>();

function decoratorFrameKey(
  authorization: AuthorizationContextV1,
  deadlineAt: Instant,
): string {
  return canonicalizeJcs({
    credential: authorization.credential,
    contextRef: authorization.context_ref ?? null,
    deadlineAt,
  });
}

function cloneDecodedJson<T>(value: T): T {
  return decodeStrictJsonValue(value) as unknown as T;
}

export function createPurposeRevocationControllerV1(): PurposeRevocationControllerV1 {
  const epochs = new Map<string, bigint>();
  const anyPrincipalEpochs = new Map<string, bigint>();
  const revokedPurposes = new Set<MemoryPrivacyPurposeRefV1>();
  const activeFrames = new Map<string, ActiveDecoratorFrame>();
  const frameReservations = new Map<string, Promise<void>>();
  const receiptBindings = new Map<
    Digest,
    {
      readonly scopeRef: OpaqueRef;
      readonly principalRef?: OpaqueRef;
      readonly baselines: ReadonlyArray<{
        readonly purposeRef: MemoryPrivacyPurposeRefV1;
        readonly epochAtIssue: bigint;
        readonly anyPrincipalEpochAtIssue: bigint;
      }>;
    }
  >();

  function scopeSlotKey(scopeRef: OpaqueRef, purposeRef: MemoryPrivacyPurposeRefV1): string {
    return canonicalizeJcs({ kind: "scope", scopeRef, purposeRef });
  }

  function principalSlotKey(
    scopeRef: OpaqueRef,
    purposeRef: MemoryPrivacyPurposeRefV1,
    principalRef: OpaqueRef,
  ): string {
    return canonicalizeJcs({ kind: "principal", scopeRef, principalRef, purposeRef });
  }

  function anyPrincipalSlotKey(scopeRef: OpaqueRef, purposeRef: MemoryPrivacyPurposeRefV1): string {
    return canonicalizeJcs({ kind: "any-principal", scopeRef, purposeRef });
  }

  function effectiveEpoch(
    scopeRef: OpaqueRef,
    purposeRef: MemoryPrivacyPurposeRefV1,
    principalRef?: OpaqueRef,
  ): bigint {
    const scopeEpoch = epochs.get(scopeSlotKey(scopeRef, purposeRef)) ?? 0n;
    if (principalRef === undefined) {
      return scopeEpoch;
    }
    const principalEpoch = epochs.get(principalSlotKey(scopeRef, purposeRef, principalRef)) ?? 0n;
    return scopeEpoch >= principalEpoch ? scopeEpoch : principalEpoch;
  }

  function anyPrincipalEpoch(scopeRef: OpaqueRef, purposeRef: MemoryPrivacyPurposeRefV1): bigint {
    return anyPrincipalEpochs.get(anyPrincipalSlotKey(scopeRef, purposeRef)) ?? 0n;
  }

  function revokePurpose(input: {
    readonly scopeRef: OpaqueRef;
    readonly purpose: MemoryPrivacyPurposeRefV1 | "memory.capture.*" | "memory.recall.*";
    readonly principalRef?: OpaqueRef;
    readonly revokedAt: Instant;
  }): Result<PurposeRevocationReceiptV1> {
    let scopeRef: OpaqueRef;
    let principalRef: OpaqueRef | undefined;
    let revokedAt: Instant;
    let targets: readonly MemoryPrivacyPurposeRefV1[];
    try {
      const obj = decodeStrictObject(
        input,
        "revokePurposeInput",
        ["scopeRef", "purpose", "principalRef", "revokedAt"],
        ["scopeRef", "purpose", "revokedAt"],
      );
      scopeRef = assertRevocationRef(obj.scopeRef, "scopeRef");
      if (Object.hasOwn(obj, "principalRef")) {
        principalRef = assertRevocationRef(obj.principalRef, "principalRef");
      }
      assertInstant(obj.revokedAt, "revokedAt");
      revokedAt = obj.revokedAt;
      const expanded = expandRevocationTargets(obj.purpose);
      if (expanded === undefined) {
        throw new SchemaFailure("purpose is unknown");
      }
      targets = expanded;
    } catch (error) {
      return privacyRefusal(
        "admin",
        "INVALID_SCHEMA",
        error instanceof SchemaFailure ? error.message : "purpose revocation input is invalid",
      );
    }

    let maxEpoch = 0n;
    for (const target of targets) {
      revokedPurposes.add(target);
      if (principalRef === undefined) {
        const slot = scopeSlotKey(scopeRef, target);
        const next = (epochs.get(slot) ?? 0n) + 1n;
        epochs.set(slot, next);
        if (next > maxEpoch) {
          maxEpoch = next;
        }
      } else {
        const slot = principalSlotKey(scopeRef, target, principalRef);
        const next = (epochs.get(slot) ?? 0n) + 1n;
        epochs.set(slot, next);
        const anySlot = anyPrincipalSlotKey(scopeRef, target);
        const nextAny = (anyPrincipalEpochs.get(anySlot) ?? 0n) + 1n;
        anyPrincipalEpochs.set(anySlot, nextAny);
        if (next > maxEpoch) {
          maxEpoch = next;
        }
      }
    }
    const revocationEpoch: Cursor = maxEpoch.toString();
    const body = {
      scopeRef,
      ...(principalRef === undefined ? {} : { principalRef }),
      revokedTargets: targets,
      revocationEpoch,
      revokedAt,
    };
    return {
      ok: true,
      value: {
        ...body,
        receiptDigest: receiptDigest("purpose-revocation", body, "receiptDigest"),
      },
    };
  }

  function checkPurposeAuthorization(input: {
    readonly operation: "capture" | "recall";
    readonly scopeRef: OpaqueRef;
    readonly purposeRef: string;
    readonly principalRef?: OpaqueRef;
  }): Result<{
    readonly namespace: "capture" | "recall";
    readonly purposeRef: MemoryPrivacyPurposeRefV1;
    readonly revocationEpoch: Cursor;
  }> {
    let operation: "capture" | "recall";
    let scopeRef: OpaqueRef;
    let purposeRef: string;
    let principalRef: OpaqueRef | undefined;
    try {
      const obj = decodeStrictObject(
        input,
        "checkPurposeInput",
        ["operation", "scopeRef", "purposeRef", "principalRef"],
        ["operation", "scopeRef", "purposeRef"],
      );
      if (obj.operation !== "capture" && obj.operation !== "recall") {
        throw new SchemaFailure("operation must be capture or recall");
      }
      operation = obj.operation;
      scopeRef = assertRevocationRef(obj.scopeRef, "scopeRef");
      assertOpaque(obj.purposeRef, "purposeRef");
      purposeRef = obj.purposeRef;
      if (Object.hasOwn(obj, "principalRef")) {
        principalRef = assertRevocationRef(obj.principalRef, "principalRef");
      }
    } catch (error) {
      return privacyRefusal(
        "capture",
        "INVALID_SCHEMA",
        error instanceof SchemaFailure ? error.message : "purpose authorization input is invalid",
      );
    }

    const memoryOp: MemoryOperation = operation === "capture" ? "capture" : "recall_current";
    const namespace = classifyPurposeNamespaceV1(purposeRef);
    if (namespace === undefined) {
      return privacyRefusal(memoryOp, "INVALID_SCHEMA", "unknown memory purposeRef");
    }
    if (namespace !== operation) {
      return privacyRefusal(
        memoryOp,
        "UNAUTHORIZED",
        "purposeRef namespace does not match the requested operation",
      );
    }
    const typedPurpose = purposeRef as MemoryPrivacyPurposeRefV1;
    const currentEpoch = effectiveEpoch(scopeRef, typedPurpose, principalRef);
    if (currentEpoch > 0n) {
      return privacyRefusal(
        memoryOp,
        "AUTHORIZATION_REVOKED",
        `${namespace} purpose authorization has been revoked`,
      );
    }
    if (principalRef === undefined && anyPrincipalEpoch(scopeRef, typedPurpose) > 0n) {
      return privacyRefusal(
        memoryOp,
        "AUTHORIZATION_REVOKED",
        "principalRef is required while a principal-scoped revocation is active",
      );
    }
    return {
      ok: true,
      value: {
        namespace,
        purposeRef: typedPurpose,
        revocationEpoch: currentEpoch.toString(),
      },
    };
  }

  function areAllNamespaceTargetsRevoked(
    operation: "capture" | "recall",
    scopeRef: OpaqueRef,
    principalRef?: OpaqueRef,
  ): boolean {
    const targets: readonly MemoryPrivacyPurposeRefV1[] =
      operation === "capture" ? CAPTURE_PURPOSES_V1 : RECALL_PURPOSES_V1;
    return targets.every((target) => {
      const res = checkPurposeAuthorization({
        operation,
        scopeRef,
        purposeRef: target,
        ...(principalRef === undefined ? {} : { principalRef }),
      });
      return !res.ok;
    });
  }

  function wrapAuthorizationPort(
    inner: AuthorizationPort,
    options?: WrapAuthorizationPortOptionsV1,
  ): AuthorizationPort {
    let validInner = false;
    try {
      validInner =
        inner !== null
        && inner !== undefined
        && typeof inner === "object"
        && inner.version === 1
        && typeof inner.authorize === "function"
        && typeof inner.revalidate === "function"
        && typeof inner.redact === "function";
    } catch {
      validInner = false;
    }

    let validOptions = true;
    let resolvePrincipal: WrapAuthorizationPortOptionsV1["resolvePrincipal"];
    if (options !== undefined) {
      try {
        const optObj = decodeStrictShallowEnvelope(
          options,
          "wrapAuthorizationPortOptions",
          ["resolvePrincipal"],
          [],
        );
        if (Object.hasOwn(optObj, "resolvePrincipal") && optObj.resolvePrincipal !== undefined) {
          if (typeof optObj.resolvePrincipal !== "function") {
            validOptions = false;
          } else {
            resolvePrincipal = optObj.resolvePrincipal as WrapAuthorizationPortOptionsV1["resolvePrincipal"];
          }
        }
      } catch {
        validOptions = false;
      }
    }

    return {
      version: 1,
      async authorize(request: AuthorizationRequestV1): Promise<Result<AuthorizationResultV1>> {
        const decodedRes = decodeStrictAuthorizationRequest(request);
        if (!decodedRes.ok) {
          return decodedRes;
        }
        const { request: decodedRequest, resourcePurposeRef } = decodedRes.value;
        const op = decodedRequest.operation;
        if (!validInner || !validOptions) {
          return privacyRefusal(
            op,
            "POLICY_UNAVAILABLE",
            "inner AuthorizationPort or wrapper configuration is unavailable",
          );
        }

        const isCap = op === "capture";
        const isRec = isRecallOperation(op);
        const frame = activeFrames.get(
          decoratorFrameKey(decodedRequest.context, decodedRequest.deadline_at),
        );
        let typedPurpose: MemoryPrivacyPurposeRefV1 | undefined;
        let hasCanonicalPurpose = false;
        let principalRef: OpaqueRef | undefined;

        if (isCap || isRec) {
          const framePurpose =
            frame === undefined
              ? undefined
              : isCap
                  && (frame.kind === "capture"
                    || frame.kind === "ingest_activity"
                    || frame.kind === "propose_capitalisation")
                ? frame.purposeRef
                : isRec && frame.kind === "recall"
                  ? frame.purposeRef
                  : undefined;

          if (
            framePurpose !== undefined
            && resourcePurposeRef !== undefined
            && framePurpose !== resourcePurposeRef
          ) {
            return privacyRefusal(
              op,
              "UNAUTHORIZED",
              "authorization resource purpose_ref conflicts with MemoryPortV2 request purpose_ref",
            );
          }

          const explicitPurpose = framePurpose ?? resourcePurposeRef;
          if (explicitPurpose !== undefined) {
            const ns = classifyPurposeNamespaceV1(explicitPurpose);
            if (ns === undefined) {
              return privacyRefusal(op, "INVALID_SCHEMA", "unknown memory purposeRef");
            }
            if ((isCap && ns !== "capture") || (isRec && ns !== "recall")) {
              return privacyRefusal(
                op,
                "UNAUTHORIZED",
                "purposeRef namespace does not match operation",
              );
            }
            typedPurpose = explicitPurpose as MemoryPrivacyPurposeRefV1;
            hasCanonicalPurpose = true;
          } else if (frame?.kind !== "propose_capitalisation") {
            const ctxRef = decodedRequest.context.context_ref;
            if (ctxRef !== undefined) {
              const ctxNs = classifyPurposeNamespaceV1(ctxRef);
              if ((isCap && ctxNs === "capture") || (isRec && ctxNs === "recall")) {
                typedPurpose = ctxRef as MemoryPrivacyPurposeRefV1;
              }
            }
          }

          let portPrincipalRef: OpaqueRef | undefined;
          if (resolvePrincipal !== undefined) {
            let resolved: Result<OpaqueRef | undefined>;
            try {
              resolved = await resolvePrincipal(cloneDecodedJson(decodedRequest));
            } catch {
              return privacyRefusal(op, "POLICY_UNAVAILABLE", "principal resolution failed");
            }
            if (!resolved || typeof resolved !== "object" || resolved.ok !== true) {
              return normalizeResolverFailure(op, resolved);
            }
            if (resolved.value !== undefined) {
              try {
                const decodedPrincipal = decodeStrictJsonValue(resolved.value);
                portPrincipalRef = assertRevocationRef(decodedPrincipal, "principalRef");
              } catch {
                return privacyRefusal(op, "INVALID_SCHEMA", "resolved principalRef is invalid");
              }
            }
          }
          if (
            frame?.principalRef !== undefined
            && portPrincipalRef !== undefined
            && frame.principalRef !== portPrincipalRef
          ) {
            return privacyRefusal(
              op,
              "UNAUTHORIZED",
              "resolved AuthorizationPort principal conflicts with MemoryPortV2 principal",
            );
          }
          principalRef = portPrincipalRef ?? frame?.principalRef;

          if (decodedRequest.resource.scope_ref !== undefined) {
            const opNamespace = isCap ? "capture" : "recall";
            if (typedPurpose !== undefined) {
              const preCheck = checkPurposeAuthorization({
                operation: opNamespace,
                scopeRef: decodedRequest.resource.scope_ref,
                purposeRef: typedPurpose,
                ...(principalRef === undefined ? {} : { principalRef }),
              });
              if (!preCheck.ok) {
                return { ok: false, error: { ...preCheck.error, operation: op } };
              }
              const ctxRef = decodedRequest.context.context_ref;
              if (
                hasCanonicalPurpose
                && ctxRef !== undefined
                && classifyPurposeNamespaceV1(ctxRef) !== undefined
                && ctxRef !== typedPurpose
              ) {
                return privacyRefusal(
                  op,
                  "UNAUTHORIZED",
                  "authorization context_ref conflicts with canonical purpose_ref",
                );
              }
            } else if (
              areAllNamespaceTargetsRevoked(
                opNamespace,
                decodedRequest.resource.scope_ref,
                principalRef,
              )
            ) {
              return privacyRefusal(
                op,
                "AUTHORIZATION_REVOKED",
                `${opNamespace} purpose authorization has been revoked`,
              );
            }
          }
        }

        let innerRes: Result<AuthorizationResultV1>;
        try {
          innerRes = await inner.authorize(decodedRequest);
        } catch {
          return privacyRefusal(
            op,
            "POLICY_UNAVAILABLE",
            "inner AuthorizationPort.authorize failed",
          );
        }
        if (!innerRes || typeof innerRes !== "object") {
          return privacyRefusal(
            op,
            "POLICY_UNAVAILABLE",
            "inner AuthorizationPort.authorize returned an invalid result",
          );
        }
        if (!innerRes.ok || innerRes.value?.allowed !== true) {
          return innerRes;
        }
        if (isCap || isRec) {
          let boundScope: OpaqueRef;
          let issuedReceiptDigest: Digest;
          try {
            boundScope = assertRevocationRef(innerRes.value.scope_ref, "authorization.scope_ref");
            assertDigest(innerRes.value.receipt_digest, "authorization.receipt_digest");
            issuedReceiptDigest = innerRes.value.receipt_digest;
          } catch {
            return privacyRefusal(
              op,
              "INVALID_SCHEMA",
              "inner AuthorizationPort returned an invalid scope or receipt digest",
            );
          }
          if (
            decodedRequest.resource.scope_ref !== undefined
            && boundScope !== decodedRequest.resource.scope_ref
          ) {
            return privacyRefusal(
              op,
              "UNAUTHORIZED",
              "inner AuthorizationPort scope_ref does not bind the requested scope",
            );
          }
          if (
            frame?.scopeRef !== undefined
            && !(frame.kind === "propose_capitalisation" && isRec)
            && boundScope !== frame.scopeRef
          ) {
            return privacyRefusal(
              op,
              "UNAUTHORIZED",
              "inner AuthorizationPort scope_ref does not bind the MemoryPortV2 request scope",
            );
          }
          const opNamespace = isCap ? "capture" : "recall";
          if (typedPurpose !== undefined) {
            const postCheck = checkPurposeAuthorization({
              operation: opNamespace,
              scopeRef: boundScope,
              purposeRef: typedPurpose,
              ...(principalRef === undefined ? {} : { principalRef }),
            });
            if (!postCheck.ok) {
              return { ok: false, error: { ...postCheck.error, operation: op } };
            }
            const ctxRef = decodedRequest.context.context_ref;
            if (
              hasCanonicalPurpose
              && ctxRef !== undefined
              && classifyPurposeNamespaceV1(ctxRef) !== undefined
              && ctxRef !== typedPurpose
            ) {
              return privacyRefusal(
                op,
                "UNAUTHORIZED",
                "authorization context_ref conflicts with canonical purpose_ref",
              );
            }
            receiptBindings.set(issuedReceiptDigest, {
              scopeRef: boundScope,
              ...(principalRef === undefined ? {} : { principalRef }),
              baselines: [
                {
                  purposeRef: typedPurpose,
                  epochAtIssue: effectiveEpoch(boundScope, typedPurpose, principalRef),
                  anyPrincipalEpochAtIssue: anyPrincipalEpoch(boundScope, typedPurpose),
                },
              ],
            });
            if (frame !== undefined && frame.kind === "recall" && isRec) {
              frame.verifiedByWrappedAuth = true;
            }
          } else {
            if (areAllNamespaceTargetsRevoked(opNamespace, boundScope, principalRef)) {
              return privacyRefusal(
                op,
                "AUTHORIZATION_REVOKED",
                `${opNamespace} purpose authorization has been revoked`,
              );
            }
            const targets: readonly MemoryPrivacyPurposeRefV1[] =
              isCap ? CAPTURE_PURPOSES_V1 : RECALL_PURPOSES_V1;
            receiptBindings.set(issuedReceiptDigest, {
              scopeRef: boundScope,
              ...(principalRef === undefined ? {} : { principalRef }),
              baselines: targets.map((target) => ({
                purposeRef: target,
                epochAtIssue: effectiveEpoch(boundScope, target, principalRef),
                anyPrincipalEpochAtIssue: anyPrincipalEpoch(boundScope, target),
              })),
            });
          }
        }
        return innerRes;
      },

      async revalidate(
        receiptDigestValue: Digest,
        at: Instant,
      ): Promise<Result<AuthorizationRevalidationV1>> {
        if (!validInner || !validOptions) {
          return privacyRefusal(
            "recall_current",
            "POLICY_UNAVAILABLE",
            "inner AuthorizationPort is unavailable",
          );
        }
        let decodedDigest: Digest;
        let decodedAt: Instant;
        try {
          const rawDigest = decodeStrictJsonValue(receiptDigestValue);
          const rawAt = decodeStrictJsonValue(at);
          assertDigest(rawDigest, "receipt_digest");
          assertInstant(rawAt, "at");
          decodedDigest = rawDigest;
          decodedAt = rawAt;
        } catch {
          return privacyRefusal(
            "recall_current",
            "INVALID_SCHEMA",
            "revalidation arguments are invalid",
          );
        }
        const binding = receiptBindings.get(decodedDigest);
        if (binding !== undefined && binding.baselines.length > 0) {
          let allRevoked = true;
          let maxReportEpoch = 0n;
          for (const base of binding.baselines) {
            const current = effectiveEpoch(
              binding.scopeRef,
              base.purposeRef,
              binding.principalRef,
            );
            const currentAnyPrincipal = anyPrincipalEpoch(binding.scopeRef, base.purposeRef);
            const unknownPrincipalRevoked =
              binding.principalRef === undefined
              && currentAnyPrincipal > base.anyPrincipalEpochAtIssue;
            if (current > base.epochAtIssue || unknownPrincipalRevoked) {
              const targetEpoch =
                unknownPrincipalRevoked && currentAnyPrincipal > current
                  ? currentAnyPrincipal
                  : current;
              if (targetEpoch > maxReportEpoch) {
                maxReportEpoch = targetEpoch;
              }
            } else {
              allRevoked = false;
              break;
            }
          }
          if (allRevoked) {
            const body = {
              receipt_digest: decodedDigest,
              checked_at: decodedAt,
              valid: false,
              current_revocation_epoch: maxReportEpoch.toString(),
              reason: "revoked" as const,
            };
            return {
              ok: true,
              value: {
                ...body,
                revalidation_receipt_digest: receiptDigest(
                  "authorization-revalidation",
                  body,
                  "revalidation_receipt_digest",
                ),
              },
            };
          }
        }
        try {
          return await inner.revalidate(decodedDigest, decodedAt);
        } catch {
          return privacyRefusal(
            "recall_current",
            "POLICY_UNAVAILABLE",
            "inner AuthorizationPort.revalidate failed",
          );
        }
      },

      async redact(request: RedactionRequestV1): Promise<Result<RedactionResultV1>> {
        if (!validInner || !validOptions) {
          return privacyRefusal(
            "propose_capitalisation",
            "POLICY_UNAVAILABLE",
            "inner AuthorizationPort is unavailable",
          );
        }
        try {
          return await inner.redact(request);
        } catch {
          return privacyRefusal(
            "propose_capitalisation",
            "POLICY_UNAVAILABLE",
            "inner AuthorizationPort.redact failed",
          );
        }
      },
    };
  }

  const controller: PurposeRevocationControllerV1 = {
    revokePurpose,
    checkPurposeAuthorization,
    wrapAuthorizationPort,
    wrapMemoryPort(
      inner: MemoryPortV2,
      options?: WrapMemoryPortOptionsV1,
    ): MemoryPortV2 {
      return wrapMemoryPortWithPurposeRevocationV1(inner, controller, options);
    },
  };

  controllerBridges.set(controller, {
    async runWithDecoratorFrame<T>(frame: ActiveDecoratorFrame, fn: () => Promise<T>): Promise<T> {
      const prior = frameReservations.get(frame.frameKey) ?? Promise.resolve();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const chained = prior.then(() => gate);
      frameReservations.set(frame.frameKey, chained);
      await prior.catch(() => undefined);
      activeFrames.set(frame.frameKey, frame);
      try {
        return await fn();
      } finally {
        if (activeFrames.get(frame.frameKey) === frame) {
          activeFrames.delete(frame.frameKey);
        }
        if (frameReservations.get(frame.frameKey) === chained) {
          frameReservations.delete(frame.frameKey);
        }
        release();
      }
    },
    hasAnyRevocationForPurpose(purposeRef: MemoryPrivacyPurposeRefV1): boolean {
      return revokedPurposes.has(purposeRef);
    },
  });

  return controller;
}

export function wrapMemoryPortWithPurposeRevocationV1(
  inner: MemoryPortV2,
  controller: PurposeRevocationControllerV1,
  options?: WrapMemoryPortOptionsV1,
): MemoryPortV2 {
  let validInner = false;
  try {
    validInner =
      inner !== null
      && inner !== undefined
      && typeof inner === "object"
      && inner.version === 2
      && typeof inner.capabilities === "function"
      && typeof inner.validate === "function"
      && typeof inner.capture === "function"
      && typeof inner.ingestActivity === "function"
      && typeof inner.cancelCapture === "function"
      && typeof inner.requestAdmission === "function"
      && typeof inner.transition === "function"
      && typeof inner.recall === "function"
      && typeof inner.proposeCapitalisation === "function"
      && typeof inner.proposeReconciliation === "function"
      && typeof inner.invalidateProjections === "function"
      && typeof inner.readiness === "function"
      && typeof inner.admin === "function";
  } catch {
    validInner = false;
  }

  let validController = false;
  try {
    validController =
      controller !== null
      && controller !== undefined
      && typeof controller === "object"
      && typeof controller.checkPurposeAuthorization === "function";
  } catch {
    validController = false;
  }

  let validOptions = true;
  let configuredScopeRef: OpaqueRef | undefined;
  let resolveScope: WrapMemoryPortOptionsV1["resolveScope"];
  let resolvePrincipal: WrapMemoryPortOptionsV1["resolvePrincipal"];
  if (options !== undefined) {
    try {
      const optObj = decodeStrictShallowEnvelope(
        options,
        "wrapMemoryPortOptions",
        ["scopeRef", "resolveScope", "resolvePrincipal"],
        [],
      );
      if (Object.hasOwn(optObj, "scopeRef") && optObj.scopeRef !== undefined) {
        configuredScopeRef = assertRevocationRef(optObj.scopeRef, "scopeRef");
      }
      if (Object.hasOwn(optObj, "resolveScope") && optObj.resolveScope !== undefined) {
        if (typeof optObj.resolveScope !== "function") {
          validOptions = false;
        } else {
          resolveScope = optObj.resolveScope as WrapMemoryPortOptionsV1["resolveScope"];
        }
      }
      if (Object.hasOwn(optObj, "resolvePrincipal") && optObj.resolvePrincipal !== undefined) {
        if (typeof optObj.resolvePrincipal !== "function") {
          validOptions = false;
        } else {
          resolvePrincipal = optObj.resolvePrincipal as WrapMemoryPortOptionsV1["resolvePrincipal"];
        }
      }
    } catch {
      validOptions = false;
    }
  }

  const bridge = validController ? controllerBridges.get(controller) : undefined;

  async function resolveInvocationPrincipal(
    errorOp: MemoryOperation,
    invocation: MemoryPortPurposeInvocationV1,
  ): Promise<Result<OpaqueRef | undefined>> {
    if (resolvePrincipal === undefined) {
      return { ok: true, value: undefined };
    }
    let resolved: Result<OpaqueRef | undefined>;
    try {
      resolved = await resolvePrincipal(invocation);
    } catch {
      return privacyRefusal(errorOp, "POLICY_UNAVAILABLE", "principal resolution failed");
    }
    if (!resolved || typeof resolved !== "object" || resolved.ok !== true) {
      return normalizeResolverFailure(errorOp, resolved);
    }
    if (resolved.value === undefined) {
      return { ok: true, value: undefined };
    }
    try {
      const decodedPrincipal = decodeStrictJsonValue(resolved.value);
      return { ok: true, value: assertRevocationRef(decodedPrincipal, "principalRef") };
    } catch {
      return privacyRefusal(errorOp, "INVALID_SCHEMA", "resolved principalRef is invalid");
    }
  }

  async function resolveRecallScope(
    invocation: Extract<MemoryPortPurposeInvocationV1, { readonly method: "recall" }>,
  ): Promise<Result<OpaqueRef | undefined>> {
    let dynamicScope: OpaqueRef | undefined;
    if (resolveScope !== undefined) {
      let resolved: Result<OpaqueRef | undefined>;
      try {
        resolved = await resolveScope(invocation);
      } catch {
        return privacyRefusal("recall_current", "POLICY_UNAVAILABLE", "scope resolution failed");
      }
      if (!resolved || typeof resolved !== "object" || resolved.ok !== true) {
        return normalizeResolverFailure("recall_current", resolved);
      }
      if (resolved.value !== undefined) {
        try {
          const decodedScope = decodeStrictJsonValue(resolved.value);
          dynamicScope = assertRevocationRef(decodedScope, "scopeRef");
        } catch {
          return privacyRefusal("recall_current", "INVALID_SCHEMA", "resolved scopeRef is invalid");
        }
      }
    }
    if (
      configuredScopeRef !== undefined
      && dynamicScope !== undefined
      && configuredScopeRef !== dynamicScope
    ) {
      return privacyRefusal(
        "recall_current",
        "UNAUTHORIZED",
        "resolved recall scopeRef conflicts with configured scopeRef",
      );
    }
    return { ok: true, value: dynamicScope ?? configuredScopeRef };
  }

  function runControllerCheck(
    errorOp: MemoryOperation,
    input: {
      readonly operation: "capture" | "recall";
      readonly scopeRef: OpaqueRef;
      readonly purposeRef: MemoryPrivacyPurposeRefV1;
      readonly principalRef?: OpaqueRef;
    },
  ): Result<true> {
    let res: Result<unknown>;
    try {
      res = controller.checkPurposeAuthorization(input);
    } catch {
      return privacyRefusal(errorOp, "POLICY_UNAVAILABLE", "purpose revocation check failed");
    }
    if (!res || typeof res !== "object") {
      return privacyRefusal(errorOp, "POLICY_UNAVAILABLE", "purpose revocation check failed");
    }
    if (res.ok !== true) {
      return normalizeResolverFailure(errorOp, res);
    }
    return { ok: true, value: true };
  }

  function hasConflictingContextRef(
    authorization: AuthorizationContextV1,
    canonicalPurpose: MemoryPrivacyPurposeRefV1,
  ): boolean {
    const ctxRef = authorization.context_ref;
    return (
      ctxRef !== undefined
      && classifyPurposeNamespaceV1(ctxRef) !== undefined
      && ctxRef !== canonicalPurpose
    );
  }

  async function runInFrame<T>(
    frame: ActiveDecoratorFrame,
    fn: () => Promise<T>,
  ): Promise<T> {
    return bridge !== undefined ? bridge.runWithDecoratorFrame(frame, fn) : fn();
  }

  function unavailableConfig<T>(operation: MemoryOperation): Result<T> {
    return privacyRefusal(
      operation,
      "POLICY_UNAVAILABLE",
      "inner MemoryPortV2, revocation controller, or decorator options are unavailable",
    );
  }

  async function delegateGuarded<T>(
    operation: MemoryOperation,
    call: () => Promise<Result<T>>,
  ): Promise<Result<T>> {
    if (!validInner || !validController || !validOptions) {
      return unavailableConfig(operation);
    }
    try {
      return await call();
    } catch {
      return privacyRefusal(operation, "POLICY_UNAVAILABLE", `inner MemoryPortV2.${operation} failed`);
    }
  }

  return {
    version: 2,
    capabilities(): Promise<Result<CapabilityDescriptorV1>> {
      return delegateGuarded("admin", () => inner.capabilities());
    },
    validate(payload: CandidatePayloadV2): Result<{ payload_digest: Digest }> {
      if (!validInner || !validController || !validOptions) {
        return unavailableConfig("capture");
      }
      try {
        return inner.validate(payload);
      } catch {
        return privacyRefusal("capture", "POLICY_UNAVAILABLE", "inner MemoryPortV2.validate failed");
      }
    },
    async capture(request: CaptureRequestV2): Promise<Result<CaptureAcknowledgementV1>> {
      const decoded = decodeStrictCaptureRequest(request);
      if (!decoded.ok) {
        return decoded;
      }
      if (!validInner || !validController || !validOptions) {
        return unavailableConfig("capture");
      }
      const { request: decodedRequest, scopeRef, purposeRef } = decoded.value;
      const ns = classifyPurposeNamespaceV1(purposeRef);
      if (ns === undefined) {
        return privacyRefusal("capture", "INVALID_SCHEMA", "unknown memory purposeRef");
      }
      if (ns !== "capture") {
        return privacyRefusal(
          "capture",
          "UNAUTHORIZED",
          "purposeRef namespace does not match capture operation",
        );
      }
      const typedPurpose = purposeRef as CapturePurposeRefV1;
      const invocation: MemoryPortPurposeInvocationV1 = {
        method: "capture",
        operation: "capture",
        scopeRef,
        purposeRef: typedPurpose,
        authorization: { ...decodedRequest.authorization },
        request: cloneDecodedJson(decodedRequest),
      };
      const principalRes = await resolveInvocationPrincipal("capture", invocation);
      if (!principalRes.ok) {
        return principalRes;
      }
      const principalRef = principalRes.value;
      const checked = runControllerCheck("capture", {
        operation: "capture",
        scopeRef,
        purposeRef: typedPurpose,
        ...(principalRef === undefined ? {} : { principalRef }),
      });
      if (!checked.ok) {
        return checked;
      }
      if (hasConflictingContextRef(decodedRequest.authorization, typedPurpose)) {
        return privacyRefusal(
          "capture",
          "UNAUTHORIZED",
          "authorization context_ref conflicts with canonical payload.purpose_ref",
        );
      }
      const frame: ActiveDecoratorFrame = {
        kind: "capture",
        purposeRef: typedPurpose,
        scopeRef,
        ...(principalRef === undefined ? {} : { principalRef }),
        frameKey: decoratorFrameKey(decodedRequest.authorization, decodedRequest.deadline_at),
        verifiedByWrappedAuth: false,
      };
      try {
        return await runInFrame(frame, () => inner.capture(decodedRequest));
      } catch {
        return privacyRefusal("capture", "POLICY_UNAVAILABLE", "inner MemoryPortV2.capture failed");
      }
    },
    async ingestActivity(
      request: ActivityIngestionRequestV1,
    ): Promise<Result<ActivityIngestionReceiptV1>> {
      const decoded = decodeStrictActivityIngestionRequest(request);
      if (!decoded.ok) {
        return decoded;
      }
      if (!validInner || !validController || !validOptions) {
        return unavailableConfig("capture");
      }
      const { request: decodedRequest, scopeRef, purposeRef } = decoded.value;
      const ns = classifyPurposeNamespaceV1(purposeRef);
      if (ns === undefined) {
        return privacyRefusal("capture", "INVALID_SCHEMA", "unknown memory purposeRef");
      }
      if (ns !== "capture") {
        return privacyRefusal(
          "capture",
          "UNAUTHORIZED",
          "purposeRef namespace does not match ingestActivity capture operation",
        );
      }
      const typedPurpose = purposeRef as CapturePurposeRefV1;
      const invocation: MemoryPortPurposeInvocationV1 = {
        method: "ingestActivity",
        operation: "capture",
        scopeRef,
        purposeRef: typedPurpose,
        authorization: { ...decodedRequest.authorization },
        request: cloneDecodedJson(decodedRequest),
      };
      const principalRes = await resolveInvocationPrincipal("capture", invocation);
      if (!principalRes.ok) {
        return principalRes;
      }
      const principalRef = principalRes.value;
      const checked = runControllerCheck("capture", {
        operation: "capture",
        scopeRef,
        purposeRef: typedPurpose,
        ...(principalRef === undefined ? {} : { principalRef }),
      });
      if (!checked.ok) {
        return checked;
      }
      if (hasConflictingContextRef(decodedRequest.authorization, typedPurpose)) {
        return privacyRefusal(
          "capture",
          "UNAUTHORIZED",
          "authorization context_ref conflicts with canonical purpose_ref",
        );
      }
      const frame: ActiveDecoratorFrame = {
        kind: "ingest_activity",
        purposeRef: typedPurpose,
        scopeRef,
        ...(principalRef === undefined ? {} : { principalRef }),
        frameKey: decoratorFrameKey(decodedRequest.authorization, decodedRequest.deadline_at),
        verifiedByWrappedAuth: false,
      };
      try {
        return await runInFrame(frame, () => inner.ingestActivity(decodedRequest));
      } catch {
        return privacyRefusal(
          "capture",
          "POLICY_UNAVAILABLE",
          "inner MemoryPortV2.ingestActivity failed",
        );
      }
    },
    cancelCapture(cancellationRef: OpaqueRef): Promise<Result<{ cancelled: boolean }>> {
      return delegateGuarded("cancel_capture", () => inner.cancelCapture(cancellationRef));
    },
    requestAdmission(request: AdmissionRequestV1): Promise<Result<AdmissionOutcomeV1>> {
      return delegateGuarded("request_admission", () => inner.requestAdmission(request));
    },
    transition(command: LifecycleCommandV1): Promise<Result<LifecycleReceiptV1>> {
      return delegateGuarded("reject", () => inner.transition(command));
    },
    async recall(request: RecallRequestV2): Promise<Result<RecallPacketV2>> {
      const decoded = decodeStrictRecallRequest(request);
      if (!decoded.ok) {
        return decoded;
      }
      if (!validInner || !validController || !validOptions) {
        return unavailableConfig("recall_current");
      }
      const { request: decodedRequest, purposeRef } = decoded.value;
      const ns = classifyPurposeNamespaceV1(purposeRef);
      if (ns === undefined) {
        return privacyRefusal("recall_current", "INVALID_SCHEMA", "unknown memory purposeRef");
      }
      if (ns !== "recall") {
        return privacyRefusal(
          "recall_current",
          "UNAUTHORIZED",
          "purposeRef namespace does not match recall operation",
        );
      }
      const typedPurpose = purposeRef as RecallPurposeRefV1;
      const scopeInvocation: Extract<MemoryPortPurposeInvocationV1, { readonly method: "recall" }> = {
        method: "recall",
        operation: "recall_current",
        ...(configuredScopeRef === undefined ? {} : { scopeRef: configuredScopeRef }),
        purposeRef: typedPurpose,
        authorization: { ...decodedRequest.authorization },
        request: cloneDecodedJson(decodedRequest),
      };
      const scopeRes = await resolveRecallScope(scopeInvocation);
      if (!scopeRes.ok) {
        return scopeRes;
      }
      const resolvedScopeRef = scopeRes.value;
      const principalInvocation: Extract<MemoryPortPurposeInvocationV1, { readonly method: "recall" }> = {
        method: "recall",
        operation: "recall_current",
        ...(resolvedScopeRef === undefined ? {} : { scopeRef: resolvedScopeRef }),
        purposeRef: typedPurpose,
        authorization: { ...decodedRequest.authorization },
        request: cloneDecodedJson(decodedRequest),
      };
      const principalRes = await resolveInvocationPrincipal("recall_current", principalInvocation);
      if (!principalRes.ok) {
        return principalRes;
      }
      const principalRef = principalRes.value;

      if (resolvedScopeRef !== undefined) {
        const checked = runControllerCheck("recall_current", {
          operation: "recall",
          scopeRef: resolvedScopeRef,
          purposeRef: typedPurpose,
          ...(principalRef === undefined ? {} : { principalRef }),
        });
        if (!checked.ok) {
          return checked;
        }
        if (hasConflictingContextRef(decodedRequest.authorization, typedPurpose)) {
          return privacyRefusal(
            "recall_current",
            "UNAUTHORIZED",
            "authorization context_ref conflicts with canonical recall purpose_ref",
          );
        }
      } else if (bridge === undefined) {
        return privacyRefusal(
          "recall_current",
          "POLICY_UNAVAILABLE",
          "recall requires scopeRef or resolveScope when decorating with an external controller",
        );
      }

      const frame: ActiveDecoratorFrame = {
        kind: "recall",
        purposeRef: typedPurpose,
        ...(resolvedScopeRef === undefined ? {} : { scopeRef: resolvedScopeRef }),
        ...(principalRef === undefined ? {} : { principalRef }),
        frameKey: decoratorFrameKey(decodedRequest.authorization, decodedRequest.budgets.deadline_at),
        verifiedByWrappedAuth: false,
      };
      let innerRes: Result<RecallPacketV2>;
      try {
        innerRes = await runInFrame(frame, () => inner.recall(decodedRequest));
      } catch {
        return privacyRefusal(
          "recall_current",
          "POLICY_UNAVAILABLE",
          "inner MemoryPortV2.recall failed",
        );
      }
      if (resolvedScopeRef === undefined && !frame.verifiedByWrappedAuth) {
        if (bridge !== undefined && bridge.hasAnyRevocationForPurpose(typedPurpose)) {
          return privacyRefusal(
            "recall_current",
            "AUTHORIZATION_REVOKED",
            "recall scope could not be verified while a recall purpose revocation is active",
          );
        }
        if (innerRes && typeof innerRes === "object" && innerRes.ok === true && Array.isArray(innerRes.value?.records)) {
          for (const entry of innerRes.value.records) {
            const recordScope = entry?.record?.scope_ref;
            if (typeof recordScope === "string") {
              const postCheck = runControllerCheck("recall_current", {
                operation: "recall",
                scopeRef: recordScope,
                purposeRef: typedPurpose,
                ...(principalRef === undefined ? {} : { principalRef }),
              });
              if (!postCheck.ok) {
                return postCheck;
              }
            }
          }
        }
        if (hasConflictingContextRef(decodedRequest.authorization, typedPurpose)) {
          return privacyRefusal(
            "recall_current",
            "UNAUTHORIZED",
            "authorization context_ref conflicts with canonical recall purpose_ref",
          );
        }
      }
      return innerRes;
    },
    async proposeCapitalisation(
      request: CapitalisationRequestV1,
    ): Promise<Result<CaptureAcknowledgementV1>> {
      const decoded = decodeStrictCapitalisationRequest(request);
      if (!decoded.ok) {
        return decoded;
      }
      if (!validInner || !validController || !validOptions) {
        return unavailableConfig("propose_capitalisation");
      }
      const { request: decodedRequest, targetScopeRef, purposeRef } = decoded.value;
      const ns = classifyPurposeNamespaceV1(purposeRef);
      if (ns === undefined) {
        return privacyRefusal("propose_capitalisation", "INVALID_SCHEMA", "unknown memory purposeRef");
      }
      if (ns !== "capture") {
        return privacyRefusal(
          "propose_capitalisation",
          "UNAUTHORIZED",
          "purposeRef namespace does not match proposeCapitalisation target capture operation",
        );
      }
      const typedPurpose = purposeRef as CapturePurposeRefV1;
      const invocation: MemoryPortPurposeInvocationV1 = {
        method: "proposeCapitalisation",
        operation: "propose_capitalisation",
        scopeRef: targetScopeRef,
        purposeRef: typedPurpose,
        authorization: { ...decodedRequest.authorization },
        request: cloneDecodedJson(decodedRequest),
      };
      const principalRes = await resolveInvocationPrincipal("propose_capitalisation", invocation);
      if (!principalRes.ok) {
        return principalRes;
      }
      const principalRef = principalRes.value;
      const checked = runControllerCheck("propose_capitalisation", {
        operation: "capture",
        scopeRef: targetScopeRef,
        purposeRef: typedPurpose,
        ...(principalRef === undefined ? {} : { principalRef }),
      });
      if (!checked.ok) {
        return checked;
      }
      if (hasConflictingContextRef(decodedRequest.authorization, typedPurpose)) {
        return privacyRefusal(
          "propose_capitalisation",
          "UNAUTHORIZED",
          "authorization context_ref conflicts with canonical capitalisation purpose_ref",
        );
      }
      const frame: ActiveDecoratorFrame = {
        kind: "propose_capitalisation",
        purposeRef: typedPurpose,
        scopeRef: targetScopeRef,
        ...(principalRef === undefined ? {} : { principalRef }),
        frameKey: decoratorFrameKey(decodedRequest.authorization, decodedRequest.deadline_at),
        verifiedByWrappedAuth: false,
      };
      try {
        return await runInFrame(frame, () => inner.proposeCapitalisation(decodedRequest));
      } catch {
        return privacyRefusal(
          "propose_capitalisation",
          "POLICY_UNAVAILABLE",
          "inner MemoryPortV2.proposeCapitalisation failed",
        );
      }
    },
    proposeReconciliation(
      request: ReconciliationRequestV1,
    ): Promise<Result<ReconciliationOutcomeV1>> {
      return delegateGuarded("propose_reconciliation", () => inner.proposeReconciliation(request));
    },
    invalidateProjections(
      request: ProjectionInvalidationRequestV1,
    ): Promise<Result<ProjectionInvalidationReceiptV1>> {
      return delegateGuarded("projection_invalidate", () => inner.invalidateProjections(request));
    },
    readiness(): Promise<Result<OperationalCapabilityReceiptV1>> {
      return delegateGuarded("admin", () => inner.readiness());
    },
    admin(request: AdminOperationRequestV1): Promise<Result<AdminEpochReceiptV1>> {
      return delegateGuarded("admin", () => inner.admin(request));
    },
  };
}
