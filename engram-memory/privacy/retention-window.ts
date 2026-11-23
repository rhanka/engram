import type {
  CryptoPort,
  Digest,
  Instant,
  MemoryErrorCode,
  OpaqueRef,
  Result,
  RetentionV1,
} from "../contracts/index.js";
import { receiptDigest, recordIdFromDigest } from "../digests.js";
import type { SessionFrontScopeV1 } from "../session-front-engine.js";
import {
  assertDigest,
  assertInstant,
  assertOpaque,
  assertSafeEpoch,
  SchemaFailure,
} from "../validation.js";
import {
  decodeStrictJsonValue,
  decodeStrictObject,
  decodeStrictScope,
  decodeStrictShallowEnvelope,
  isSessionPseudonymV1,
  privacyRefusal,
} from "./pseudonym.js";

export const PURGE_ANNOUNCEMENT_SCHEMA_VERSION = "engram.purge-announcement/v1" as const;

export const PURGE_TARGET_CLASSES_V1 = [
  "host-context-log",
  "host-audit-view",
  "expired-memory-envelope",
] as const;

export type PurgeTargetClassV1 = (typeof PURGE_TARGET_CLASSES_V1)[number];

export interface HostAuditRetentionPolicyV1 {
  readonly policyId: string;
  readonly auditWindowMs: number;
  readonly derivativeRule: RetentionV1["derivative_rule"];
}

export type ChannelRetentionPolicyV1 =
  | { readonly kind: "finite"; readonly maxAgeMs: number }
  | { readonly kind: "unbounded" };

export type AuditWindowStateV1 =
  | "presented-for-audit"
  | "presentation-stopped"
  | "purged";

export interface PurgeAnnouncementReceiptV1 {
  readonly schemaVersion: typeof PURGE_ANNOUNCEMENT_SCHEMA_VERSION;
  readonly announcementId: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly sessionPseudoIds: readonly string[];
  readonly hostAuditPolicyId: string;
  readonly closedWindowEnd: Instant;
  readonly announcedAt: Instant;
  readonly executeNotBefore: Instant;
  readonly targetClasses: readonly PurgeTargetClassV1[];
  readonly receiptDigest: Digest;
}

function isDerivativeRule(value: unknown): value is RetentionV1["derivative_rule"] {
  return value === "retain" || value === "make-ineligible";
}

function isPurgeTargetClass(value: unknown): value is PurgeTargetClassV1 {
  return typeof value === "string" && (PURGE_TARGET_CLASSES_V1 as readonly string[]).includes(value);
}

function addMsToInstant(base: Instant, deltaMs: number, field: string): Instant {
  const sum = Date.parse(base) + deltaMs;
  if (!Number.isSafeInteger(sum)) {
    throw new SchemaFailure(`${field} overflows safe instant range`);
  }
  const iso = new Date(sum).toISOString();
  assertInstant(iso, field);
  return iso;
}

function decodeHostPolicy(value: unknown): HostAuditRetentionPolicyV1 {
  const obj = decodeStrictObject(
    value,
    "hostPolicy",
    ["policyId", "auditWindowMs", "derivativeRule"],
    ["policyId", "auditWindowMs", "derivativeRule"],
  );
  assertOpaque(obj.policyId, "hostPolicy.policyId");
  assertSafeEpoch(obj.auditWindowMs, "hostPolicy.auditWindowMs");
  if (obj.auditWindowMs < 1) {
    throw new SchemaFailure("hostPolicy.auditWindowMs must be positive");
  }
  if (!isDerivativeRule(obj.derivativeRule)) {
    throw new SchemaFailure("hostPolicy.derivativeRule is invalid");
  }
  return {
    policyId: obj.policyId,
    auditWindowMs: obj.auditWindowMs,
    derivativeRule: obj.derivativeRule,
  };
}

function decodeChannelRetention(value: unknown): ChannelRetentionPolicyV1 {
  const obj = decodeStrictObject(value, "channelRetention", ["kind", "maxAgeMs"], ["kind"]);
  if (obj.kind === "unbounded") {
    if (Object.hasOwn(obj, "maxAgeMs")) {
      throw new SchemaFailure("unbounded channelRetention must not carry maxAgeMs");
    }
    return { kind: "unbounded" };
  }
  if (obj.kind === "finite") {
    if (!Object.hasOwn(obj, "maxAgeMs")) {
      throw new SchemaFailure("finite channelRetention requires maxAgeMs");
    }
    assertSafeEpoch(obj.maxAgeMs, "channelRetention.maxAgeMs");
    if (obj.maxAgeMs < 1) {
      throw new SchemaFailure("channelRetention.maxAgeMs must be positive");
    }
    return { kind: "finite", maxAgeMs: obj.maxAgeMs };
  }
  throw new SchemaFailure("channelRetention.kind is unknown");
}

function decodeRetentionValue(value: unknown): RetentionV1 {
  const obj = decodeStrictObject(
    value,
    "retention",
    ["derivative_rule", "expires_at"],
    ["derivative_rule"],
  );
  if (!isDerivativeRule(obj.derivative_rule)) {
    throw new SchemaFailure("retention.derivative_rule is invalid");
  }
  let expiresAt: Instant | undefined;
  if (Object.hasOwn(obj, "expires_at")) {
    assertInstant(obj.expires_at, "retention.expires_at");
    expiresAt = obj.expires_at;
  }
  return expiresAt === undefined
    ? { derivative_rule: obj.derivative_rule }
    : { derivative_rule: obj.derivative_rule, expires_at: expiresAt };
}

export function computeRetentionDeadlineV1(
  channelRetention: ChannelRetentionPolicyV1,
  firstAdmissionAt: Instant,
): Result<Instant | undefined> {
  try {
    const channel = decodeChannelRetention(channelRetention);
    const decodedAdmission = decodeStrictJsonValue(firstAdmissionAt);
    assertInstant(decodedAdmission, "firstAdmissionAt");
    if (channel.kind === "unbounded") {
      return { ok: true, value: undefined };
    }
    const deadline = addMsToInstant(decodedAdmission, channel.maxAgeMs, "retentionDeadline");
    return { ok: true, value: deadline };
  } catch (error) {
    return privacyRefusal(
      "capture",
      "INVALID_SCHEMA",
      error instanceof SchemaFailure ? error.message : "retention deadline input is invalid",
    );
  }
}

export function validateHostRetentionV1(input: {
  readonly hostPolicy: HostAuditRetentionPolicyV1;
  readonly retention: RetentionV1;
  readonly firstAdmissionAt: Instant;
  readonly channelRetention: ChannelRetentionPolicyV1;
  readonly closedAt?: Instant;
  readonly callerPolicyId?: string;
}): Result<{
  readonly retention: RetentionV1;
  readonly effectiveDeadline?: Instant;
  readonly hostAuditPolicyId: string;
}> {
  let obj: Record<string, unknown>;
  try {
    obj = decodeStrictObject(
      input,
      "hostRetentionValidation",
      [
        "hostPolicy",
        "retention",
        "firstAdmissionAt",
        "channelRetention",
        "closedAt",
        "callerPolicyId",
      ],
      ["retention", "firstAdmissionAt", "channelRetention"],
    );
  } catch (error) {
    return privacyRefusal(
      "capture",
      "INVALID_SCHEMA",
      error instanceof SchemaFailure ? error.message : "host retention input is invalid",
    );
  }

  if (!Object.hasOwn(obj, "hostPolicy") || obj.hostPolicy === null) {
    return privacyRefusal(
      "capture",
      "POLICY_UNAVAILABLE",
      "declared host audit retention policy is unavailable",
    );
  }

  let hostPolicy: HostAuditRetentionPolicyV1;
  let retention: RetentionV1;
  let firstAdmissionAt: Instant;
  let channelRetention: ChannelRetentionPolicyV1;
  let closedAt: Instant | undefined;
  let callerPolicyId: string | undefined;
  try {
    hostPolicy = decodeHostPolicy(obj.hostPolicy);
    retention = decodeRetentionValue(obj.retention);
    assertInstant(obj.firstAdmissionAt, "firstAdmissionAt");
    firstAdmissionAt = obj.firstAdmissionAt;
    channelRetention = decodeChannelRetention(obj.channelRetention);
    if (Object.hasOwn(obj, "closedAt")) {
      assertInstant(obj.closedAt, "closedAt");
      closedAt = obj.closedAt;
      if (Date.parse(closedAt) < Date.parse(firstAdmissionAt)) {
        throw new SchemaFailure("closedAt precedes firstAdmissionAt");
      }
    }
    if (Object.hasOwn(obj, "callerPolicyId")) {
      assertOpaque(obj.callerPolicyId, "callerPolicyId");
      callerPolicyId = obj.callerPolicyId;
    }
  } catch (error) {
    return privacyRefusal(
      "capture",
      "INVALID_SCHEMA",
      error instanceof SchemaFailure ? error.message : "host retention fields are invalid",
    );
  }

  if (callerPolicyId !== undefined && callerPolicyId !== hostPolicy.policyId) {
    return privacyRefusal(
      "capture",
      "INVALID_SCHEMA",
      "ad-hoc per-CLI policy override is rejected by host audit retention policy",
    );
  }
  if (retention.derivative_rule !== hostPolicy.derivativeRule) {
    return privacyRefusal(
      "capture",
      "INVALID_SCHEMA",
      "retention.derivative_rule must match the declared host audit retention policy",
    );
  }

  const channelDeadlineRes = computeRetentionDeadlineV1(channelRetention, firstAdmissionAt);
  if (!channelDeadlineRes.ok) {
    return channelDeadlineRes;
  }
  let hostAuditExpiresAt: Instant | undefined;
  if (closedAt !== undefined) {
    try {
      hostAuditExpiresAt = addMsToInstant(closedAt, hostPolicy.auditWindowMs, "hostAuditExpiresAt");
    } catch (error) {
      return privacyRefusal(
        "capture",
        "INVALID_SCHEMA",
        error instanceof SchemaFailure ? error.message : "host audit expiry is invalid",
      );
    }
  }

  const channelDeadline = channelDeadlineRes.value;
  let effectiveDeadline: Instant | undefined;
  if (hostAuditExpiresAt !== undefined && channelDeadline !== undefined) {
    effectiveDeadline =
      Date.parse(hostAuditExpiresAt) <= Date.parse(channelDeadline)
        ? hostAuditExpiresAt
        : channelDeadline;
  } else {
    effectiveDeadline = hostAuditExpiresAt ?? channelDeadline;
  }

  if (effectiveDeadline === undefined) {
    if (retention.expires_at !== undefined) {
      return privacyRefusal(
        "capture",
        "INVALID_SCHEMA",
        "ad-hoc per-CLI expires_at is rejected when host and channel retention are unbounded",
      );
    }
  } else {
    if (retention.expires_at === undefined) {
      return privacyRefusal(
        "capture",
        "INVALID_SCHEMA",
        "retention.expires_at is required under a finite retention deadline",
      );
    }
    const providedMs = Date.parse(retention.expires_at);
    const effectiveMs = Date.parse(effectiveDeadline);
    if (providedMs > effectiveMs) {
      return privacyRefusal(
        "capture",
        "INVALID_SCHEMA",
        "retention.expires_at exceeds the computed retention deadline",
      );
    }
    if (providedMs < effectiveMs) {
      return privacyRefusal(
        "capture",
        "INVALID_SCHEMA",
        "ad-hoc per-CLI TTL override is rejected by the declared host retention policy",
      );
    }
  }

  return {
    ok: true,
    value: {
      retention,
      ...(effectiveDeadline === undefined ? {} : { effectiveDeadline }),
      hostAuditPolicyId: hostPolicy.policyId,
    },
  };
}

export function evaluateAuditWindowV1(input: {
  readonly hostPolicy: HostAuditRetentionPolicyV1;
  readonly closedAt: Instant;
  readonly now: Instant;
}): Result<{
  readonly state: Exclude<AuditWindowStateV1, "purged">;
  readonly auditWindowEndsAt: Instant;
  readonly purgeEligible: boolean;
}> {
  try {
    const obj = decodeStrictObject(
      input,
      "auditWindowInput",
      ["hostPolicy", "closedAt", "now"],
      ["hostPolicy", "closedAt", "now"],
    );
    const hostPolicy = decodeHostPolicy(obj.hostPolicy);
    assertInstant(obj.closedAt, "closedAt");
    assertInstant(obj.now, "now");
    if (Date.parse(obj.now) < Date.parse(obj.closedAt)) {
      throw new SchemaFailure("now precedes closedAt");
    }
    const auditWindowEndsAt = addMsToInstant(
      obj.closedAt,
      hostPolicy.auditWindowMs,
      "auditWindowEndsAt",
    );
    const purgeEligible = Date.parse(obj.now) >= Date.parse(auditWindowEndsAt);
    return {
      ok: true,
      value: {
        state: purgeEligible ? "presentation-stopped" : "presented-for-audit",
        auditWindowEndsAt,
        purgeEligible,
      },
    };
  } catch (error) {
    return privacyRefusal(
      "expire",
      "INVALID_SCHEMA",
      error instanceof SchemaFailure ? error.message : "audit window input is invalid",
    );
  }
}

function decodeSessionPseudoIds(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4_096) {
    throw new SchemaFailure(`${field} must be a non-empty bounded array`);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const id = value[i];
    if (!isSessionPseudonymV1(id) || seen.has(id)) {
      throw new SchemaFailure(`${field}[${i}] must be a unique D33 session pseudonym`);
    }
    seen.add(id);
    out.push(id);
  }
  return out;
}

function decodeTargetClasses(value: unknown, field: string): readonly PurgeTargetClassV1[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > PURGE_TARGET_CLASSES_V1.length) {
    throw new SchemaFailure(`${field} must be a non-empty array of admissible purge classes`);
  }
  const seen = new Set<PurgeTargetClassV1>();
  const out: PurgeTargetClassV1[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const cls = value[i];
    if (!isPurgeTargetClass(cls) || seen.has(cls)) {
      throw new SchemaFailure(`${field}[${i}] is invalid or duplicated`);
    }
    seen.add(cls);
    out.push(cls);
  }
  return out;
}

function computePurgeReceiptDigest(
  body: Omit<PurgeAnnouncementReceiptV1, "receiptDigest">,
): Digest {
  return receiptDigest("purge-announcement", body, "receiptDigest");
}

export function createPurgeAnnouncementReceiptV1(input: {
  readonly hostPolicy: HostAuditRetentionPolicyV1;
  readonly scope: SessionFrontScopeV1;
  readonly sessionPseudoIds: readonly string[];
  readonly closedAt: Instant;
  readonly announcedAt: Instant;
  readonly executeNotBefore?: Instant;
  readonly targetClasses: readonly PurgeTargetClassV1[];
}): Result<PurgeAnnouncementReceiptV1> {
  let hostPolicy: HostAuditRetentionPolicyV1;
  let scope: SessionFrontScopeV1;
  let sessionPseudoIds: readonly string[];
  let closedAt: Instant;
  let announcedAt: Instant;
  let executeNotBefore: Instant;
  let targetClasses: readonly PurgeTargetClassV1[];
  try {
    const obj = decodeStrictObject(
      input,
      "purgeAnnouncementInput",
      [
        "hostPolicy",
        "scope",
        "sessionPseudoIds",
        "closedAt",
        "announcedAt",
        "executeNotBefore",
        "targetClasses",
      ],
      ["hostPolicy", "scope", "sessionPseudoIds", "closedAt", "announcedAt", "targetClasses"],
    );
    hostPolicy = decodeHostPolicy(obj.hostPolicy);
    scope = decodeStrictScope(obj.scope, "scope");
    sessionPseudoIds = decodeSessionPseudoIds(obj.sessionPseudoIds, "sessionPseudoIds");
    assertInstant(obj.closedAt, "closedAt");
    closedAt = obj.closedAt;
    assertInstant(obj.announcedAt, "announcedAt");
    announcedAt = obj.announcedAt;
    if (Object.hasOwn(obj, "executeNotBefore")) {
      assertInstant(obj.executeNotBefore, "executeNotBefore");
      executeNotBefore = obj.executeNotBefore;
    } else {
      executeNotBefore = announcedAt;
    }
    if (Date.parse(executeNotBefore) < Date.parse(announcedAt)) {
      throw new SchemaFailure("executeNotBefore precedes announcedAt");
    }
    targetClasses = decodeTargetClasses(obj.targetClasses, "targetClasses");
  } catch (error) {
    return privacyRefusal(
      "expire",
      "INVALID_SCHEMA",
      error instanceof SchemaFailure ? error.message : "purge announcement input is invalid",
    );
  }

  let closedWindowEnd: Instant;
  try {
    closedWindowEnd = addMsToInstant(closedAt, hostPolicy.auditWindowMs, "closedWindowEnd");
  } catch (error) {
    return privacyRefusal(
      "expire",
      "INVALID_SCHEMA",
      error instanceof SchemaFailure ? error.message : "closedWindowEnd is invalid",
    );
  }
  if (Date.parse(announcedAt) < Date.parse(closedWindowEnd)) {
    return privacyRefusal(
      "expire",
      "ILLEGAL_TRANSITION",
      "purge announcement cannot precede the end of the post-close audit window",
    );
  }

  const idDigest = receiptDigest("purge-announcement-id", {
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    hostAuditPolicyId: hostPolicy.policyId,
    closedWindowEnd,
    sessionPseudoIds: [...sessionPseudoIds],
    targetClasses: [...targetClasses],
  });
  const announcementId = `purge_${recordIdFromDigest(idDigest).slice("mem_".length)}`;
  const body: Omit<PurgeAnnouncementReceiptV1, "receiptDigest"> = {
    schemaVersion: PURGE_ANNOUNCEMENT_SCHEMA_VERSION,
    announcementId,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    sessionPseudoIds,
    hostAuditPolicyId: hostPolicy.policyId,
    closedWindowEnd,
    announcedAt,
    executeNotBefore,
    targetClasses,
  };
  return {
    ok: true,
    value: {
      ...body,
      receiptDigest: computePurgeReceiptDigest(body),
    },
  };
}

export function verifyPurgeAnnouncementReceiptV1(
  receipt: unknown,
): Result<PurgeAnnouncementReceiptV1> {
  let body: Omit<PurgeAnnouncementReceiptV1, "receiptDigest">;
  let claimedDigest: Digest;
  try {
    const obj = decodeStrictObject(
      receipt,
      "purgeAnnouncementReceipt",
      [
        "schemaVersion",
        "announcementId",
        "tenantId",
        "workspaceId",
        "sessionPseudoIds",
        "hostAuditPolicyId",
        "closedWindowEnd",
        "announcedAt",
        "executeNotBefore",
        "targetClasses",
        "receiptDigest",
      ],
      [
        "schemaVersion",
        "announcementId",
        "tenantId",
        "workspaceId",
        "sessionPseudoIds",
        "hostAuditPolicyId",
        "closedWindowEnd",
        "announcedAt",
        "executeNotBefore",
        "targetClasses",
        "receiptDigest",
      ],
    );
    if (obj.schemaVersion !== PURGE_ANNOUNCEMENT_SCHEMA_VERSION) {
      throw new SchemaFailure("schemaVersion must be engram.purge-announcement/v1");
    }
    assertOpaque(obj.announcementId, "announcementId");
    assertOpaque(obj.tenantId, "tenantId");
    assertOpaque(obj.workspaceId, "workspaceId");
    assertOpaque(obj.hostAuditPolicyId, "hostAuditPolicyId");
    const sessionPseudoIds = decodeSessionPseudoIds(obj.sessionPseudoIds, "sessionPseudoIds");
    assertInstant(obj.closedWindowEnd, "closedWindowEnd");
    assertInstant(obj.announcedAt, "announcedAt");
    assertInstant(obj.executeNotBefore, "executeNotBefore");
    if (Date.parse(obj.announcedAt) < Date.parse(obj.closedWindowEnd)) {
      throw new SchemaFailure("announcedAt precedes closedWindowEnd");
    }
    if (Date.parse(obj.executeNotBefore) < Date.parse(obj.announcedAt)) {
      throw new SchemaFailure("executeNotBefore precedes announcedAt");
    }
    const targetClasses = decodeTargetClasses(obj.targetClasses, "targetClasses");
    assertDigest(obj.receiptDigest, "receiptDigest");
    claimedDigest = obj.receiptDigest;
    body = {
      schemaVersion: PURGE_ANNOUNCEMENT_SCHEMA_VERSION,
      announcementId: obj.announcementId,
      tenantId: obj.tenantId,
      workspaceId: obj.workspaceId,
      sessionPseudoIds,
      hostAuditPolicyId: obj.hostAuditPolicyId,
      closedWindowEnd: obj.closedWindowEnd,
      announcedAt: obj.announcedAt,
      executeNotBefore: obj.executeNotBefore,
      targetClasses,
    };
  } catch (error) {
    return privacyRefusal(
      "expire",
      "INVALID_SCHEMA",
      error instanceof SchemaFailure ? error.message : "purge announcement receipt is invalid",
    );
  }

  const expected = computePurgeReceiptDigest(body);
  if (claimedDigest !== expected) {
    return privacyRefusal(
      "expire",
      "INVALID_DIGEST",
      "purge announcement receiptDigest does not bind its fields",
    );
  }
  return { ok: true, value: { ...body, receiptDigest: claimedDigest } };
}

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

function normalizeExpireCallbackFailure<T>(result: unknown, fallbackMessage: string): Result<T> {
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
            operation: "expire",
            message: candidate.message,
            retryable: candidate.retryable,
          },
        };
      }
    }
  }
  return privacyRefusal("expire", "STORE_UNAVAILABLE", fallbackMessage, true);
}

function isValidDigestValue(value: unknown): value is Digest {
  try {
    assertDigest(value, "receipt_digest");
    return true;
  } catch {
    return false;
  }
}

export async function executeAnnouncedPurgeV1(input: {
  readonly hostPolicy: HostAuditRetentionPolicyV1;
  readonly announcement: PurgeAnnouncementReceiptV1;
  readonly now: Instant;
  readonly journalAnnouncement: (
    receipt: PurgeAnnouncementReceiptV1,
  ) => Promise<Result<{ readonly journaled: true }>> | Result<{ readonly journaled: true }>;
  readonly purgeTarget: (
    targetClass: PurgeTargetClassV1,
    receipt: PurgeAnnouncementReceiptV1,
  ) => Promise<Result<{ readonly purged: true }>> | Result<{ readonly purged: true }>;
  readonly crypto?: CryptoPort;
  readonly expiredKeyRefs?: readonly OpaqueRef[];
}): Promise<
  Result<{
    readonly state: "purged";
    readonly announcementReceiptDigest: Digest;
    readonly purgedClasses: readonly PurgeTargetClassV1[];
    readonly destroyedKeyCount: number;
    readonly executionReceiptDigest: Digest;
  }>
> {
  let envelope: Record<string, unknown>;
  try {
    envelope = decodeStrictShallowEnvelope(
      input,
      "executeAnnouncedPurgeInput",
      [
        "hostPolicy",
        "announcement",
        "now",
        "journalAnnouncement",
        "purgeTarget",
        "crypto",
        "expiredKeyRefs",
      ],
      ["hostPolicy", "now", "journalAnnouncement", "purgeTarget"],
    );
  } catch (error) {
    return privacyRefusal(
      "expire",
      "INVALID_SCHEMA",
      error instanceof SchemaFailure ? error.message : "purge execution input is invalid",
    );
  }

  if (
    typeof envelope.journalAnnouncement !== "function"
    || typeof envelope.purgeTarget !== "function"
  ) {
    return privacyRefusal(
      "expire",
      "INVALID_SCHEMA",
      "journalAnnouncement and purgeTarget callbacks are required",
    );
  }

  let hostPolicy: HostAuditRetentionPolicyV1;
  let now: Instant;
  let expiredKeyRefs: readonly OpaqueRef[] = [];
  try {
    hostPolicy = decodeHostPolicy(envelope.hostPolicy);
    const decodedNow = decodeStrictJsonValue(envelope.now);
    assertInstant(decodedNow, "now");
    now = decodedNow;
    if (Object.hasOwn(envelope, "expiredKeyRefs") && envelope.expiredKeyRefs !== undefined) {
      const decodedKeys = decodeStrictJsonValue(envelope.expiredKeyRefs);
      if (!Array.isArray(decodedKeys)) {
        throw new SchemaFailure("expiredKeyRefs must be a dense array");
      }
      const keyList: OpaqueRef[] = [];
      for (let i = 0; i < decodedKeys.length; i += 1) {
        const keyRef = decodedKeys[i];
        assertOpaque(keyRef, `expiredKeyRefs[${i}]`);
        keyList.push(keyRef);
      }
      expiredKeyRefs = keyList;
    }
  } catch (error) {
    return privacyRefusal(
      "expire",
      "INVALID_SCHEMA",
      error instanceof SchemaFailure ? error.message : "purge execution parameters are invalid",
    );
  }

  if (
    !Object.hasOwn(envelope, "announcement")
    || envelope.announcement === undefined
    || envelope.announcement === null
  ) {
    return privacyRefusal(
      "expire",
      "ILLEGAL_TRANSITION",
      "purge execution requires a PurgeAnnouncementReceiptV1 first",
    );
  }
  const verifiedRes = verifyPurgeAnnouncementReceiptV1(envelope.announcement);
  if (!verifiedRes.ok) {
    return verifiedRes;
  }
  const receipt = verifiedRes.value;
  if (receipt.hostAuditPolicyId !== hostPolicy.policyId) {
    return privacyRefusal(
      "expire",
      "POLICY_STALE",
      "purge announcement does not match the declared host audit retention policy",
    );
  }
  if (Date.parse(now) < Date.parse(receipt.executeNotBefore)) {
    return privacyRefusal(
      "expire",
      "ILLEGAL_TRANSITION",
      "purge cannot execute before executeNotBefore",
    );
  }

  let cryptoPort: CryptoPort | undefined;
  if (expiredKeyRefs.length > 0) {
    try {
      const candidateCrypto = envelope.crypto as CryptoPort | undefined;
      if (
        candidateCrypto === null
        || candidateCrypto === undefined
        || typeof candidateCrypto !== "object"
        || candidateCrypto.version !== 1
        || typeof candidateCrypto.destroy !== "function"
      ) {
        return privacyRefusal(
          "expire",
          "CAPABILITY_UNAVAILABLE",
          "CryptoPort.destroy is required to destroy expired sealed candidate keys",
        );
      }
      cryptoPort = candidateCrypto;
    } catch {
      return privacyRefusal(
        "expire",
        "CAPABILITY_UNAVAILABLE",
        "CryptoPort.destroy is required to destroy expired sealed candidate keys",
      );
    }
  }

  // Step 1: announce and journal the immutable PurgeAnnouncementReceiptV1 BEFORE any destruction.
  let journaled: Result<{ readonly journaled: true }>;
  try {
    journaled = await (
      envelope.journalAnnouncement as (
        r: PurgeAnnouncementReceiptV1,
      ) => Promise<Result<{ readonly journaled: true }>> | Result<{ readonly journaled: true }>
    )(receipt);
  } catch {
    return privacyRefusal(
      "expire",
      "STORE_UNAVAILABLE",
      "failed to journal purge announcement receipt",
      true,
    );
  }
  if (
    !journaled
    || typeof journaled !== "object"
    || journaled.ok !== true
    || journaled.value === null
    || typeof journaled.value !== "object"
    || journaled.value.journaled !== true
  ) {
    return normalizeExpireCallbackFailure(
      journaled,
      "purge announcement was not durably journaled",
    );
  }

  // Step 2: destroy expired candidate keys and purge announced target classes.
  let destroyedKeyCount = 0;
  for (const keyRef of expiredKeyRefs) {
    const destroyKeyDigest = receiptDigest("purge-key-destroy", {
      announcementId: receipt.announcementId,
      announcementReceiptDigest: receipt.receiptDigest,
      keyRef,
    });
    const idempotencyKey = `purge:${destroyKeyDigest.slice("sha256:".length)}`;
    let destroyed: Result<{ destroyed: boolean; receipt_digest: Digest }>;
    try {
      destroyed = await cryptoPort!.destroy({
        key_ref: keyRef,
        idempotency_key: idempotencyKey,
      });
    } catch {
      return privacyRefusal("expire", "STORE_UNAVAILABLE", "key destruction failed", true);
    }
    if (
      !destroyed
      || typeof destroyed !== "object"
      || destroyed.ok !== true
      || destroyed.value === null
      || typeof destroyed.value !== "object"
      || destroyed.value.destroyed !== true
      || !isValidDigestValue(destroyed.value.receipt_digest)
    ) {
      return normalizeExpireCallbackFailure(
        destroyed,
        "key destruction did not report destroyed: true",
      );
    }
    destroyedKeyCount += 1;
  }

  const purgedClasses: PurgeTargetClassV1[] = [];
  for (const targetClass of receipt.targetClasses) {
    let purged: Result<{ readonly purged: true }>;
    try {
      purged = await (
        envelope.purgeTarget as (
          cls: PurgeTargetClassV1,
          r: PurgeAnnouncementReceiptV1,
        ) => Promise<Result<{ readonly purged: true }>> | Result<{ readonly purged: true }>
      )(targetClass, receipt);
    } catch {
      return privacyRefusal("expire", "STORE_UNAVAILABLE", "target purge failed", true);
    }
    if (
      !purged
      || typeof purged !== "object"
      || purged.ok !== true
      || purged.value === null
      || typeof purged.value !== "object"
      || purged.value.purged !== true
    ) {
      return normalizeExpireCallbackFailure(purged, "target purge did not complete");
    }
    purgedClasses.push(targetClass);
  }

  const executionReceiptDigest = receiptDigest("purge-execution", {
    announcementId: receipt.announcementId,
    announcementReceiptDigest: receipt.receiptDigest,
    executedAt: now,
    purgedClasses,
    destroyedKeyCount,
  });
  return {
    ok: true,
    value: {
      state: "purged",
      announcementReceiptDigest: receipt.receiptDigest,
      purgedClasses,
      destroyedKeyCount,
      executionReceiptDigest,
    },
  };
}
