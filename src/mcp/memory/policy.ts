/**
 * MCP-L0 Host Policy, Trusted Provenance, Destructive Elicitation Confirmation,
 * and Durable Idempotent Operation Identity Contracts.
 *
 * Normative alignment with SPEC-memory-mcp-v2.md (M2, M4, M5, M7):
 * - Host-injected trusted scope, principal, tenant, store, connector, and
 *   short-lived authorization context (no fabricated defaults).
 * - Host-owned `RetentionV1` resolution: rejects expiration > host ceiling and
 *   rejects `derivative_rule: 'retain'` unless explicitly allowed by host policy.
 * - Host-owned `ReconciliationConsentV1` resolution: defaults omitted/empty
 *   reconciliation consent to `{ family_refs: [] }` (never auto-expanding to
 *   all consented families) and rejects unconsented family refs.
 * - Host-minted neutral `LifecycleEventAnchorV1` (`{ occurred_at, kind_ref,
 *   provenance_ref, provenance_digest }`), frozen across retries.
 * - Host elicitation `confirm` validation (`validated_resumed`, closed request
 *   `{ capability, target_ref, operation_digest }`, closed response
 *   `{ approved: true }`, <= 300s TTL).
 * - Durable idempotent operation reservation bound to the M5 9-tuple +
 *   `normalized_input_digest` + `source_order` / `event_id` / `event_anchor`,
 *   `DIGEST_CONFLICT` on mismatch, fresh authorization on replay, and
 *   same-scope tombstone recapture refusal.
 */

import { createHash } from 'node:crypto';
import { isValidTrustedAuditId, TRUSTED_CONTEXT_UNAVAILABLE_PROTOCOL_ERROR, type McpProtocolErrorObjectV1 } from './errors.js';
import {
  ENGRAM_MEMORY_CONNECTOR_ID,
  ENGRAM_MEMORY_MCP_CONTRACT_VERSION,
  ENGRAM_MEMORY_PROVIDER_ID,
  ENGRAM_MEMORY_TOOL_NAMES,
  MEMORY_MCP_LIMITS,
  TOMBSTONE_ALLOWED_FROM_STATES,
  type AdmissionDecision,
  type AuthorizationContextV1,
  type CandidatePayloadV2,
  type CaptureOutputV1,
  type Cursor,
  type Digest,
  type EngramMemoryToolName,
  type EvidenceBundleV1,
  type ForgetOutputV1,
  type IdempotencyKey,
  type Instant,
  type LifecycleEventAnchorV1,
  type MemoryState,
  type OpaqueRef,
  type PublicMemoryErrorCode,
  type ReconciliationConsentV1,
  type RequestAdmissionOutputV1,
  type RetentionV1,
  type WithdrawOutputV1,
} from './contracts.js';
import {
  isValidCursor,
  isValidCandidateId,
  isValidIdempotencyKey,
  isValidInstant,
  isValidOpaqueRef,
  isValidRecordId,
  isValidSha256Digest,
  isWellFormedUnicode,
  isWellFormedUnicodeAndNfc,
  utf8ByteLength,
  validateCapturePayloadInputV1,
  validateEvidenceBundleV1,
} from './schemas.js';

export interface TrustedInvocationContextV1 {
  readonly principal_id: OpaqueRef;
  readonly principal_namespace: OpaqueRef;
  readonly tenant_id: OpaqueRef;
  readonly store_id: OpaqueRef;
  readonly connector_id: 'engram-memory';
  readonly scope_ref: OpaqueRef;
  readonly mcp_client_id: OpaqueRef;
  readonly session_id: OpaqueRef;
  readonly correlation_id: OpaqueRef;
  readonly now_utc: Instant;
  readonly deadline_ms: number;
  readonly authorization_context: AuthorizationContextV1;
  readonly policy_epoch?: Cursor;
  readonly trust_epoch?: Cursor;
  readonly authorization_receipt_digest?: Digest;
  readonly authorization_issued_at?: Instant;
  readonly authorization_expires_at?: Instant;
}

export type PolicyValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly error_code: PublicMemoryErrorCode;
      readonly message: string;
    };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

/**
 * M4 validation of the host/broker-injected invocation context.
 * Refuses fabricated or missing scope/principal/tenant/authorization bindings.
 */
export function validateTrustedInvocationContextV1(
  ctx: unknown,
): PolicyValidationResult<TrustedInvocationContextV1> {
  if (!isPlainObject(ctx)) {
    return {
      ok: false,
      error_code: 'UNAUTHORIZED',
      message: 'Missing trusted host invocation context.',
    };
  }

  for (const field of [
    'principal_id',
    'principal_namespace',
    'tenant_id',
    'store_id',
    'scope_ref',
    'mcp_client_id',
    'session_id',
    'correlation_id',
  ] as const) {
    if (!isValidOpaqueRef(ctx[field])) {
      return {
        ok: false,
        error_code: 'UNAUTHORIZED',
        message: `Missing or invalid trusted ${field}.`,
      };
    }
  }

  if (ctx.connector_id !== 'engram-memory') {
    return {
      ok: false,
      error_code: 'UNAUTHORIZED',
      message: "Trusted connector_id must equal 'engram-memory'.",
    };
  }

  if (!isValidInstant(ctx.now_utc)) {
    return {
      ok: false,
      error_code: 'INVALID_SCHEMA',
      message: 'Trusted now_utc must be a valid RFC 3339 millisecond UTC Instant.',
    };
  }

  if (
    typeof ctx.deadline_ms !== 'number' ||
    !Number.isInteger(ctx.deadline_ms) ||
    ctx.deadline_ms <= 0 ||
    ctx.deadline_ms > MEMORY_MCP_LIMITS.MAX_INVOCATION_DEADLINE_MS
  ) {
    return {
      ok: false,
      error_code: 'INVALID_SCHEMA',
      message: `Invocation deadline_ms must be 1..${MEMORY_MCP_LIMITS.MAX_INVOCATION_DEADLINE_MS}.`,
    };
  }

  if (!isPlainObject(ctx.authorization_context)) {
    return {
      ok: false,
      error_code: 'UNAUTHORIZED',
      message: 'Missing trusted AuthorizationContextV1.',
    };
  }

  const authCtx = ctx.authorization_context;
  const authKeys = Object.keys(authCtx);
  if (
    authKeys.some((k) => k !== 'credential' && k !== 'context_ref') ||
    !isValidOpaqueRef(authCtx.credential, 4096) ||
    ('context_ref' in authCtx && !isValidOpaqueRef(authCtx.context_ref))
  ) {
    return {
      ok: false,
      error_code: 'UNAUTHORIZED',
      message:
        'Invalid trusted AuthorizationContextV1 credential or context_ref.',
    };
  }

  if (
    ctx.policy_epoch !== undefined &&
    !isValidCursor(ctx.policy_epoch)
  ) {
    return {
      ok: false,
      error_code: 'UNAUTHORIZED',
      message: 'Invalid trusted policy_epoch.',
    };
  }
  if (
    ctx.trust_epoch !== undefined &&
    !isValidCursor(ctx.trust_epoch)
  ) {
    return {
      ok: false,
      error_code: 'UNAUTHORIZED',
      message: 'Invalid trusted trust_epoch.',
    };
  }
  if (
    ctx.authorization_receipt_digest !== undefined &&
    !isValidSha256Digest(ctx.authorization_receipt_digest)
  ) {
    return {
      ok: false,
      error_code: 'UNAUTHORIZED',
      message: 'Invalid trusted authorization_receipt_digest.',
    };
  }

  if (
    ctx.authorization_issued_at !== undefined ||
    ctx.authorization_expires_at !== undefined
  ) {
    if (
      !isValidInstant(ctx.authorization_issued_at) ||
      !isValidInstant(ctx.authorization_expires_at)
    ) {
      return {
        ok: false,
        error_code: 'AUTHORIZATION_EXPIRED',
        message: 'Invalid authorization receipt timestamp.',
      };
    }
    const issuedMs = Date.parse(ctx.authorization_issued_at);
    const expiresMs = Date.parse(ctx.authorization_expires_at);
    const nowMs = Date.parse(ctx.now_utc);
    const maxTtlMs =
      MEMORY_MCP_LIMITS.AUTHORIZATION_RECEIPT_MAX_TTL_SECONDS * 1000;
    if (
      expiresMs <= issuedMs ||
      expiresMs - issuedMs > maxTtlMs ||
      nowMs < issuedMs ||
      nowMs > expiresMs
    ) {
      return {
        ok: false,
        error_code: 'AUTHORIZATION_EXPIRED',
        message:
          'Authorization receipt has expired or exceeds the 300s TTL ceiling.',
      };
    }
  }

  return {
    ok: true,
    value: ctx as unknown as TrustedInvocationContextV1,
  };
}

/**
 * M2 / M5 Host-minted neutral `LifecycleEventAnchorV1`.
 * Callers never supply `event_anchor` in tool input JSON; on retry, the
 * persisted anchor from the durable reservation is reused verbatim.
 */
export function createHostLifecycleEventAnchorV1(input: {
  readonly occurred_at: Instant;
  readonly kind_ref: OpaqueRef;
  readonly provenance_ref: OpaqueRef;
  readonly provenance_digest: Digest;
  readonly persisted_anchor?: LifecycleEventAnchorV1;
}): PolicyValidationResult<LifecycleEventAnchorV1> {
  if (input.persisted_anchor) {
    return { ok: true, value: input.persisted_anchor };
  }
  if (!isValidInstant(input.occurred_at)) {
    return {
      ok: false,
      error_code: 'INVALID_SCHEMA',
      message: 'event_anchor.occurred_at must be a valid Instant.',
    };
  }
  if (
    !isValidOpaqueRef(input.kind_ref) ||
    !isValidOpaqueRef(input.provenance_ref)
  ) {
    return {
      ok: false,
      error_code: 'INVALID_SCHEMA',
      message:
        'event_anchor.kind_ref and provenance_ref must be valid OpaqueRefs.',
    };
  }
  if (!isValidSha256Digest(input.provenance_digest)) {
    return {
      ok: false,
      error_code: 'INVALID_DIGEST',
      message: 'event_anchor.provenance_digest must be a valid SHA-256 Digest.',
    };
  }

  return {
    ok: true,
    value: {
      occurred_at: input.occurred_at,
      kind_ref: input.kind_ref,
      provenance_ref: input.provenance_ref,
      provenance_digest: input.provenance_digest,
    },
  };
}

export interface HostRetentionPolicyConfigV1 {
  readonly default_retention_days?: number;
  readonly max_retention_days: number;
  readonly default_expires_at?: Instant;
  readonly max_expires_at?: Instant;
  readonly allow_retain_derivative_rule: boolean;
}

const MS_PER_DAY = 86_400_000;

/**
 * M2 Host-owned `RetentionV1` resolution for `engram_memory_capture`:
 * - Reuses `persisted_retention` verbatim on idempotent retry.
 * - Defaults `derivative_rule` to `'make-ineligible'` when omitted.
 * - Rejects `derivative_rule: 'retain'` with `UNAUTHORIZED` unless
 *   `host_policy.allow_retain_derivative_rule === true` (never silently
 *   downgrades).
 * - Rejects `expires_at` exceeding the host retention ceiling with
 *   `UNAUTHORIZED` (never silently clamps/truncates).
 * - Rejects malformed or non-future `expires_at` with `INVALID_SCHEMA`.
 */
export function resolveCaptureRetentionPolicyV1(input: {
  readonly captured_at: Instant;
  readonly host_policy: HostRetentionPolicyConfigV1;
  readonly caller_retention?: RetentionV1;
  readonly persisted_retention?: RetentionV1;
}): PolicyValidationResult<RetentionV1> {
  if (input.persisted_retention) {
    return { ok: true, value: input.persisted_retention };
  }

  if (!isValidInstant(input.captured_at)) {
    return {
      ok: false,
      error_code: 'INVALID_SCHEMA',
      message: 'captured_at must be a valid RFC 3339 millisecond UTC Instant.',
    };
  }

  if (
    !Number.isFinite(input.host_policy.max_retention_days) ||
    input.host_policy.max_retention_days <= 0
  ) {
    return {
      ok: false,
      error_code: 'POLICY_UNAVAILABLE',
      message: 'Host retention policy max_retention_days must be positive.',
    };
  }

  const capturedMs = Date.parse(input.captured_at);
  let ceilingMs =
    capturedMs + input.host_policy.max_retention_days * MS_PER_DAY;
  if (input.host_policy.max_expires_at !== undefined) {
    if (!isValidInstant(input.host_policy.max_expires_at)) {
      return {
        ok: false,
        error_code: 'POLICY_UNAVAILABLE',
        message: 'Host retention policy max_expires_at is invalid.',
      };
    }
    ceilingMs = Math.min(ceilingMs, Date.parse(input.host_policy.max_expires_at));
  }

  const requestedRule =
    input.caller_retention?.derivative_rule ?? 'make-ineligible';
  if (
    requestedRule !== 'make-ineligible' &&
    requestedRule !== 'retain'
  ) {
    return {
      ok: false,
      error_code: 'INVALID_SCHEMA',
      message: "derivative_rule must be 'retain' or 'make-ineligible'.",
    };
  }

  if (
    requestedRule === 'retain' &&
    input.host_policy.allow_retain_derivative_rule !== true
  ) {
    return {
      ok: false,
      error_code: 'UNAUTHORIZED',
      message:
        "derivative_rule 'retain' is disallowed by host retention policy.",
    };
  }

  let effectiveExpiresAt: Instant | undefined;
  if (input.caller_retention?.expires_at !== undefined) {
    if (!isValidInstant(input.caller_retention.expires_at)) {
      return {
        ok: false,
        error_code: 'INVALID_SCHEMA',
        message: 'retention.expires_at must be a valid Instant.',
      };
    }
    const requestedExpiresMs = Date.parse(input.caller_retention.expires_at);
    if (requestedExpiresMs <= capturedMs) {
      return {
        ok: false,
        error_code: 'INVALID_SCHEMA',
        message: 'retention.expires_at must be strictly after captured_at.',
      };
    }
    if (requestedExpiresMs > ceilingMs) {
      return {
        ok: false,
        error_code: 'UNAUTHORIZED',
        message:
          'retention.expires_at exceeds the maximum host retention ceiling.',
      };
    }
    effectiveExpiresAt = input.caller_retention.expires_at;
  } else if (input.host_policy.default_expires_at !== undefined) {
    if (!isValidInstant(input.host_policy.default_expires_at)) {
      return {
        ok: false,
        error_code: 'POLICY_UNAVAILABLE',
        message: 'Host default_expires_at is invalid.',
      };
    }
    const defaultMs = Date.parse(input.host_policy.default_expires_at);
    if (defaultMs <= capturedMs || defaultMs > ceilingMs) {
      return {
        ok: false,
        error_code: 'POLICY_UNAVAILABLE',
        message: 'Host default_expires_at is outside valid retention bounds.',
      };
    }
    effectiveExpiresAt = input.host_policy.default_expires_at;
  } else if (input.host_policy.default_retention_days !== undefined) {
    if (
      !Number.isFinite(input.host_policy.default_retention_days) ||
      input.host_policy.default_retention_days <= 0
    ) {
      return {
        ok: false,
        error_code: 'POLICY_UNAVAILABLE',
        message: 'Host default_retention_days must be positive.',
      };
    }
    const defaultMs =
      capturedMs + input.host_policy.default_retention_days * MS_PER_DAY;
    if (defaultMs > ceilingMs) {
      return {
        ok: false,
        error_code: 'POLICY_UNAVAILABLE',
        message: 'Host default_retention_days exceeds max_retention_days.',
      };
    }
    effectiveExpiresAt = new Date(defaultMs).toISOString();
  } else {
    effectiveExpiresAt = new Date(ceilingMs).toISOString();
  }

  return {
    ok: true,
    value: {
      expires_at: effectiveExpiresAt,
      derivative_rule: requestedRule,
    },
  };
}

export interface HostReconciliationPolicyConfigV1 {
  readonly consented_family_refs: readonly OpaqueRef[];
}

/**
 * M2 Host-owned `ReconciliationConsentV1` resolution for `engram_memory_capture`:
 * - Reuses `persisted_reconciliation` verbatim on idempotent retry.
 * - When caller omits `reconciliation` or passes `{ family_refs: [] }`, returns
 *   `{ family_refs: [] }` (no cross-family reconciliation consent; NEVER
 *   auto-expands to all `consented_family_refs`).
 * - Rejects any family ref not in `host_policy.consented_family_refs` with
 *   `UNAUTHORIZED`.
 */
export function resolveCaptureReconciliationConsentV1(input: {
  readonly host_policy: HostReconciliationPolicyConfigV1;
  readonly caller_reconciliation?: ReconciliationConsentV1;
  readonly persisted_reconciliation?: ReconciliationConsentV1;
}): PolicyValidationResult<ReconciliationConsentV1> {
  if (input.persisted_reconciliation) {
    return { ok: true, value: input.persisted_reconciliation };
  }

  if (
    !input.caller_reconciliation ||
    input.caller_reconciliation.family_refs.length === 0
  ) {
    return {
      ok: true,
      value: {
        family_refs: [],
      },
    };
  }

  const requestedRefs = input.caller_reconciliation.family_refs;
  if (
    requestedRefs.length >
    MEMORY_MCP_LIMITS.RECONCILIATION_FAMILY_REFS_MAX_ITEMS
  ) {
    return {
      ok: false,
      error_code: 'INVALID_SCHEMA',
      message: `reconciliation.family_refs exceeds ${MEMORY_MCP_LIMITS.RECONCILIATION_FAMILY_REFS_MAX_ITEMS} items.`,
    };
  }

  const consented = new Set(input.host_policy.consented_family_refs);
  const seen = new Set<string>();
  for (const ref of requestedRefs) {
    if (!isValidOpaqueRef(ref)) {
      return {
        ok: false,
        error_code: 'INVALID_SCHEMA',
        message: 'reconciliation.family_refs contains an invalid OpaqueRef.',
      };
    }
    if (seen.has(ref)) {
      return {
        ok: false,
        error_code: 'INVALID_SCHEMA',
        message: `Duplicate family_ref '${ref}' in reconciliation.family_refs.`,
      };
    }
    seen.add(ref);
    if (!consented.has(ref)) {
      return {
        ok: false,
        error_code: 'UNAUTHORIZED',
        message: `Family reference '${ref}' is not permitted by active reconciliation consent.`,
      };
    }
  }

  return {
    ok: true,
    value: {
      family_refs: [...requestedRefs],
    },
  };
}

export const resolveCaptureReconciliationHookV1 =
  resolveCaptureReconciliationConsentV1;

/**
 * M4 / M7 Host Elicitation `confirm` Grant for `engram_memory_withdraw` and
 * `engram_memory_forget`.
 */
/** M4:561-567 / A06:1611: one assurance/continuation contract for every confirmation entry. */
export type DestructiveConfirmationGrantV1 = MemoryConfirmationContinuationV1;
export type ExpectedDestructiveConfirmationV1 = ExpectedConfirmationContinuationBindingV1;
export function verifyDestructiveConfirmationGrantV1(
  grant: unknown, expected: ExpectedDestructiveConfirmationV1,
): PolicyValidationResult<DestructiveConfirmationGrantV1> {
  const result = verifyMemoryConfirmationContinuationV1(grant, expected);
  return result.ok ? { ok: true, value: result.continuation } : { ok: false, error_code: result.error_code, message: result.reason };
}

/**
 * M5 / L0-A05 / R6 Durable Idempotent Operation Identity, Closed Preimage,
 * RFC 8785 JCS + SHA-256 Operation Digest, Policy Versions, and Recovery Port
 * (SPEC-memory-mcp-v3.1.md lines 606–711, 1610, 1628).
 */
export type MutatingMemoryToolName =
  | 'engram_memory_capture'
  | 'engram_memory_request_admission'
  | 'engram_memory_withdraw'
  | 'engram_memory_forget';

export const MEMORY_MUTATION_DIGEST_PROFILE_V1 =
  'sentropic.engram.memory-mutation/v1' as const;

export type MemoryMutationDigestProfileV1 =
  typeof MEMORY_MUTATION_DIGEST_PROFILE_V1;

export type MemoryMutationTargetV1 =
  | {
      readonly kind: 'capture_source';
      readonly source_ref: OpaqueRef;
      readonly sequence: Cursor;
    }
  | {
      readonly kind: 'candidate';
      readonly candidate_id: string;
    }
  | {
      readonly kind: 'record';
      readonly record_id: string;
    };

export type EffectiveMemoryMutationInputV1 =
  | {
      readonly tool_name: 'engram_memory_capture';
      readonly payload: CandidatePayloadV2;
      readonly evidence: EvidenceBundleV1;
      readonly capture_policy_version: OpaqueRef;
    }
  | {
      readonly tool_name: 'engram_memory_request_admission';
      readonly candidate_id: string;
      readonly admission_policy_version: OpaqueRef;
    }
  | {
      readonly tool_name: 'engram_memory_withdraw';
      readonly candidate_id: string;
      readonly reason_ref: OpaqueRef;
      readonly event_id: OpaqueRef;
      readonly event_anchor: LifecycleEventAnchorV1;
    }
  | {
      readonly tool_name: 'engram_memory_forget';
      readonly record_id: string;
      readonly reason_ref: OpaqueRef;
      readonly event_id: OpaqueRef;
      readonly event_anchor: LifecycleEventAnchorV1;
    };

export type MemoryMutationPolicyVersionsV1 =
  | {
      readonly tool_name: 'engram_memory_capture';
      readonly capture_policy_version: OpaqueRef;
    }
  | {
      readonly tool_name: 'engram_memory_request_admission';
      readonly admission_policy_version: OpaqueRef;
    }
  | {
      readonly tool_name: 'engram_memory_withdraw';
    }
  | {
      readonly tool_name: 'engram_memory_forget';
    };

export interface MemoryMutationPreimageV1 {
  readonly profile: MemoryMutationDigestProfileV1;
  readonly reservation_ref: OpaqueRef;
  readonly provider_id: typeof ENGRAM_MEMORY_PROVIDER_ID;
  readonly provider_contract_version: typeof ENGRAM_MEMORY_MCP_CONTRACT_VERSION;
  readonly principal_namespace: OpaqueRef;
  readonly principal_id: OpaqueRef;
  readonly tenant_id: OpaqueRef;
  readonly store_id: OpaqueRef;
  readonly connector_id: typeof ENGRAM_MEMORY_CONNECTOR_ID;
  readonly connector_instance_ref: OpaqueRef;
  readonly scope_ref: OpaqueRef;
  readonly tool_name: MutatingMemoryToolName;
  readonly idempotency_key: IdempotencyKey;
  readonly target: MemoryMutationTargetV1;
  readonly effective_input: EffectiveMemoryMutationInputV1;
}

/**
 * M5 Principal-scoped lookup key across all four mutating tools
 * (SPEC-memory-mcp-v3.1.md lines 694–698).
 *
 * Excludes `tool_name`, `tool_contract_version`, `target`, and `operation_digest`
 * so reusing the same `idempotency_key` across tools or targets in the same
 * principal namespace conflicts (`DIGEST_CONFLICT`).
 */
export interface MemoryMutationLookupKeyV1 {
  readonly principal_namespace: OpaqueRef;
  readonly principal_id: OpaqueRef;
  readonly tenant_id: OpaqueRef;
  readonly store_id: OpaqueRef;
  readonly provider_id: typeof ENGRAM_MEMORY_PROVIDER_ID;
  readonly connector_id: typeof ENGRAM_MEMORY_CONNECTOR_ID;
  readonly connector_instance_ref: OpaqueRef;
  readonly scope_ref: OpaqueRef;
  readonly idempotency_key: IdempotencyKey;
}

export type MemoryMutationRecoveryStateV1 =
  | 'pending_confirmation'
  | 'authorized_uncommitted'
  | 'executing_unknown_outcome'
  | 'canonical_committed_receipt'
  | 'completed_response'
  | 'terminal_refusal';

export interface MemoryMutationBindingV1<TOutput = unknown> {
  readonly lookup_key: MemoryMutationLookupKeyV1;
  readonly preimage: MemoryMutationPreimageV1;
  readonly operation_digest: Digest;
  readonly policy_versions: MemoryMutationPolicyVersionsV1;
  readonly recovery_state: MemoryMutationRecoveryStateV1;
  readonly audit_id: OpaqueRef;
  readonly execution_generation: Cursor;
  readonly canonical_replay_ref?: OpaqueRef;
  readonly confirmation_ref?: OpaqueRef;
  readonly stored_output?: TOutput;
}

export interface MemoryMutationRecoveryPortV1<TOutput = unknown> {
  reserveOrLoad(
    lookupKey: MemoryMutationLookupKeyV1,
    candidatePreimage: MemoryMutationPreimageV1,
  ): Promise<PolicyValidationResult<MemoryMutationBindingV1<TOutput>>>;
  attachConfirmation(
    reservationRef: OpaqueRef,
    confirmationRef: OpaqueRef,
    operationDigest: Digest,
  ): Promise<PolicyValidationResult<MemoryMutationBindingV1<TOutput>>>;
  claimFencedExecution(
    reservationRef: OpaqueRef,
    executionGeneration: Cursor,
  ): Promise<PolicyValidationResult<MemoryMutationBindingV1<TOutput>>>;
  reconcileCanonicalOutcome(
    reservationRef: OpaqueRef,
    canonicalReplayRef: OpaqueRef,
  ): Promise<PolicyValidationResult<MemoryMutationBindingV1<TOutput>>>;
  recordCompletion(
    reservationRef: OpaqueRef,
    output: TOutput,
  ): Promise<PolicyValidationResult<MemoryMutationBindingV1<TOutput>>>;
}

function isValidPolicyVersionRef(value: unknown): value is OpaqueRef {
  return (
    isValidOpaqueRef(value) &&
    value !== 'current' &&
    value !== 'default' &&
    value !== 'latest'
  );
}

/**
 * Validates and projects `MemoryMutationPolicyVersionsV1` from `EffectiveMemoryMutationInputV1`
 * (SPEC-memory-mcp-v3.1.md lines 667–684, 706–708).
 *
 * Refuses missing versions, placeholder defaults (`"current"`), fabricated
 * capture/admission versions on withdraw/forget, or mismatched explicit projections.
 */
export function projectMemoryMutationPolicyVersionsV1(
  effectiveInput: unknown,
  explicitProjection?: unknown,
): PolicyValidationResult<MemoryMutationPolicyVersionsV1> {
  if (!isPlainObject(effectiveInput)) {
    return {
      ok: false,
      error_code: 'INVALID_SCHEMA',
      message: 'effective_input must be a closed object.',
    };
  }

  let derived: MemoryMutationPolicyVersionsV1;
  if (effectiveInput.tool_name === 'engram_memory_capture') {
    if (!isValidPolicyVersionRef(effectiveInput.capture_policy_version)) {
      return {
        ok: false,
        error_code: 'INVALID_SCHEMA',
        message:
          'engram_memory_capture requires an explicit non-empty NFC capture_policy_version (no default or "current").',
      };
    }
    derived = {
      tool_name: 'engram_memory_capture',
      capture_policy_version: effectiveInput.capture_policy_version,
    };
  } else if (effectiveInput.tool_name === 'engram_memory_request_admission') {
    if (!isValidPolicyVersionRef(effectiveInput.admission_policy_version)) {
      return {
        ok: false,
        error_code: 'INVALID_SCHEMA',
        message:
          'engram_memory_request_admission requires an explicit non-empty NFC admission_policy_version (no default or "current").',
      };
    }
    derived = {
      tool_name: 'engram_memory_request_admission',
      admission_policy_version: effectiveInput.admission_policy_version,
    };
  } else if (
    effectiveInput.tool_name === 'engram_memory_withdraw' ||
    effectiveInput.tool_name === 'engram_memory_forget'
  ) {
    if (
      'capture_policy_version' in effectiveInput ||
      'admission_policy_version' in effectiveInput
    ) {
      return {
        ok: false,
        error_code: 'INVALID_SCHEMA',
        message:
          'withdraw/forget effective_input must not fabricate capture_policy_version or admission_policy_version.',
      };
    }
    derived = { tool_name: effectiveInput.tool_name };
  } else {
    return {
      ok: false,
      error_code: 'INVALID_SCHEMA',
      message: 'Unknown mutating tool_name in effective_input.',
    };
  }

  if (arguments.length > 1) {
    if (!isPlainObject(explicitProjection)) {
      return {
        ok: false,
        error_code: 'INVALID_SCHEMA',
        message: 'policy_versions must be a closed object.',
      };
    }
    const projKeys = Object.keys(explicitProjection).sort();
    const derivedKeys = Object.keys(derived).sort();
    if (
      projKeys.length !== derivedKeys.length ||
      projKeys.some(
        (k, i) =>
          k !== derivedKeys[i] ||
          explicitProjection[k] !== (derived as Record<string, unknown>)[k],
      )
    ) {
      return {
        ok: false,
        error_code: 'INVALID_SCHEMA',
        message:
          'Persisted policy_versions projection is inconsistent with effective_input.',
      };
    }
  }

  return { ok: true, value: derived };
}

function validateClosedNoNullsAndWellFormedJson(
  value: unknown,
  seen = new WeakSet<object>(),
): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return true;
  if (typeof value === 'string') {
    return isWellFormedUnicode(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) return false;
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) return false;
    return true;
  }
  if (typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      if (!validateClosedNoNullsAndWellFormedJson(item, seen)) {
        seen.delete(value);
        return false;
      }
    }
    seen.delete(value);
    return true;
  }
  if (!isPlainObject(value) || Object.getOwnPropertySymbols(value).length > 0) {
    seen.delete(value);
    return false;
  }
  for (const key of Object.keys(value)) {
    if (
      !isWellFormedUnicodeAndNfc(key) ||
      !validateClosedNoNullsAndWellFormedJson(value[key], seen)
    ) {
      seen.delete(value);
      return false;
    }
  }
  seen.delete(value);
  return true;
}

const PREIMAGE_ALLOWED_KEYS = [
  'profile',
  'reservation_ref',
  'provider_id',
  'provider_contract_version',
  'principal_namespace',
  'principal_id',
  'tenant_id',
  'store_id',
  'connector_id',
  'connector_instance_ref',
  'scope_ref',
  'tool_name',
  'idempotency_key',
  'target',
  'effective_input',
] as const;

function hasExactKeys(
  obj: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const actual = Object.keys(obj);
  if (actual.length !== expectedKeys.length) return false;
  const expectedSet = new Set(expectedKeys);
  return actual.every((k) => expectedSet.has(k) && obj[k] !== undefined && obj[k] !== null);
}

/**
 * Validates `MemoryMutationPreimageV1` against all M5 / L0-A05 closed-schema,
 * target-consistency, NFC, and policy-version rules before JCS hashing.
 */
export function validateMemoryMutationPreimageV1(
  preimage: unknown,
): PolicyValidationResult<MemoryMutationPreimageV1> {
  if (
    !isPlainObject(preimage) ||
    !hasExactKeys(preimage, PREIMAGE_ALLOWED_KEYS) ||
    !validateClosedNoNullsAndWellFormedJson(preimage)
  ) {
    return {
      ok: false,
      error_code: 'INVALID_SCHEMA',
      message:
        'MemoryMutationPreimageV1 must be a closed object with all required properties and no nulls.',
    };
  }

  if (preimage.profile !== MEMORY_MUTATION_DIGEST_PROFILE_V1) {
    return {
      ok: false,
      error_code: 'INVALID_SCHEMA',
      message: `preimage.profile must equal '${MEMORY_MUTATION_DIGEST_PROFILE_V1}'.`,
    };
  }
  if (preimage.provider_id !== ENGRAM_MEMORY_PROVIDER_ID) {
    return {
      ok: false,
      error_code: 'INVALID_SCHEMA',
      message: `preimage.provider_id must equal '${ENGRAM_MEMORY_PROVIDER_ID}'.`,
    };
  }
  if (
    preimage.provider_contract_version !== ENGRAM_MEMORY_MCP_CONTRACT_VERSION
  ) {
    return {
      ok: false,
      error_code: 'INVALID_SCHEMA',
      message: `preimage.provider_contract_version must equal '${ENGRAM_MEMORY_MCP_CONTRACT_VERSION}'.`,
    };
  }
  if (preimage.connector_id !== ENGRAM_MEMORY_CONNECTOR_ID) {
    return {
      ok: false,
      error_code: 'INVALID_SCHEMA',
      message: `preimage.connector_id must equal '${ENGRAM_MEMORY_CONNECTOR_ID}'.`,
    };
  }

  for (const field of [
    'reservation_ref',
    'principal_namespace',
    'principal_id',
    'tenant_id',
    'store_id',
    'connector_instance_ref',
    'scope_ref',
  ] as const) {
    if (!isValidOpaqueRef(preimage[field])) {
      return {
        ok: false,
        error_code: 'INVALID_SCHEMA',
        message: `preimage.${field} must be a valid NFC OpaqueRef.`,
      };
    }
  }

  if (!isValidIdempotencyKey(preimage.idempotency_key)) {
    return {
      ok: false,
      error_code: 'INVALID_SCHEMA',
      message: 'preimage.idempotency_key must be a valid NFC IdempotencyKey.',
    };
  }

  const target = preimage.target;
  const effectiveInput = preimage.effective_input;
  if (!isPlainObject(target) || !isPlainObject(effectiveInput)) {
    return {
      ok: false,
      error_code: 'INVALID_SCHEMA',
      message: 'preimage.target and preimage.effective_input must be closed objects.',
    };
  }

  if (preimage.tool_name !== effectiveInput.tool_name) {
    return {
      ok: false,
      error_code: 'INVALID_SCHEMA',
      message:
        'Outer preimage.tool_name and inner effective_input.tool_name must match.',
    };
  }

  const pvCheck = projectMemoryMutationPolicyVersionsV1(effectiveInput);
  if (!pvCheck.ok) {
    return pvCheck;
  }

  if (preimage.tool_name === 'engram_memory_capture') {
    if (
      !hasExactKeys(target, ['kind', 'source_ref', 'sequence']) ||
      target.kind !== 'capture_source' ||
      !isValidOpaqueRef(target.source_ref) ||
      !isValidCursor(target.sequence)
    ) {
      return {
        ok: false,
        error_code: 'INVALID_SCHEMA',
        message:
          'engram_memory_capture requires a closed capture_source target with valid source_ref and sequence.',
      };
    }
    if (
      !hasExactKeys(effectiveInput, [
        'tool_name',
        'payload',
        'evidence',
        'capture_policy_version',
      ])
    ) {
      return {
        ok: false,
        error_code: 'INVALID_SCHEMA',
        message:
          'engram_memory_capture effective_input must have exact keys [tool_name, payload, evidence, capture_policy_version].',
      };
    }
    const payloadObj = effectiveInput.payload;
    if (
      !isPlainObject(payloadObj) ||
      !hasExactKeys(payloadObj, [
        'schema_version',
        'scope_ref',
        'purpose_ref',
        'valid_time',
        'components',
        'primary_component_id',
        'primary_event',
        'citations',
        'retention',
        'reconciliation',
      ]) ||
      payloadObj.scope_ref !== preimage.scope_ref
    ) {
      return {
        ok: false,
        error_code: 'INVALID_SCHEMA',
        message:
          'Capture effective_input.payload must be a closed CandidatePayloadV2 with host-resolved scope_ref, retention, and reconciliation (and no derivation).',
      };
    }
    const retentionObj = payloadObj.retention;
    if (
      !isPlainObject(retentionObj) ||
      !isValidInstant(retentionObj.expires_at)
    ) {
      return {
        ok: false,
        error_code: 'INVALID_SCHEMA',
        message:
          'Capture effective_input.payload.retention must include a resolved finite expires_at Instant.',
      };
    }
    const { scope_ref: _omittedScope, ...callerShapePayload } = payloadObj;
    const payloadCheck = validateCapturePayloadInputV1(callerShapePayload);
    if (!payloadCheck.ok) {
      return {
        ok: false,
        error_code: payloadCheck.code,
        message: payloadCheck.message,
      };
    }
    const citSet = new Set(
      payloadCheck.value.citations.map((c) => c.citation_id),
    );
    const evCheck = validateEvidenceBundleV1(
      effectiveInput.evidence,
      citSet,
      'effective_input.evidence',
    );
    if (!evCheck.ok) {
      return {
        ok: false,
        error_code: evCheck.code,
        message: evCheck.message,
      };
    }
  } else if (preimage.tool_name === 'engram_memory_request_admission') {
    if (
      !hasExactKeys(target, ['kind', 'candidate_id']) ||
      target.kind !== 'candidate' ||
      !isValidCandidateId(target.candidate_id)
    ) {
      return {
        ok: false,
        error_code: 'INVALID_SCHEMA',
        message:
          'engram_memory_request_admission requires a closed candidate target.',
      };
    }
    if (
      !hasExactKeys(effectiveInput, [
        'tool_name',
        'candidate_id',
        'admission_policy_version',
      ]) ||
      effectiveInput.candidate_id !== target.candidate_id
    ) {
      return {
        ok: false,
        error_code: 'INVALID_SCHEMA',
        message:
          'engram_memory_request_admission effective_input must match target.candidate_id and include admission_policy_version.',
      };
    }
  } else if (preimage.tool_name === 'engram_memory_withdraw') {
    if (
      !hasExactKeys(target, ['kind', 'candidate_id']) ||
      target.kind !== 'candidate' ||
      !isValidCandidateId(target.candidate_id)
    ) {
      return {
        ok: false,
        error_code: 'INVALID_SCHEMA',
        message: 'engram_memory_withdraw requires a closed candidate target.',
      };
    }
    if (
      !hasExactKeys(effectiveInput, [
        'tool_name',
        'candidate_id',
        'reason_ref',
        'event_id',
        'event_anchor',
      ]) ||
      effectiveInput.candidate_id !== target.candidate_id ||
      !isValidOpaqueRef(effectiveInput.reason_ref) ||
      !isValidOpaqueRef(effectiveInput.event_id)
    ) {
      return {
        ok: false,
        error_code: 'INVALID_SCHEMA',
        message:
          'engram_memory_withdraw effective_input must match target.candidate_id and contain valid reason_ref, event_id, and event_anchor.',
      };
    }
    const anchor = effectiveInput.event_anchor;
    if (
      !isPlainObject(anchor) ||
      !hasExactKeys(anchor, [
        'occurred_at',
        'kind_ref',
        'provenance_ref',
        'provenance_digest',
      ]) ||
      !isValidInstant(anchor.occurred_at) ||
      !isValidOpaqueRef(anchor.kind_ref) ||
      !isValidOpaqueRef(anchor.provenance_ref) ||
      !isValidSha256Digest(anchor.provenance_digest)
    ) {
      return {
        ok: false,
        error_code: 'INVALID_SCHEMA',
        message: 'Invalid event_anchor in engram_memory_withdraw effective_input.',
      };
    }
  } else if (preimage.tool_name === 'engram_memory_forget') {
    if (
      !hasExactKeys(target, ['kind', 'record_id']) ||
      target.kind !== 'record' ||
      !isValidRecordId(target.record_id)
    ) {
      return {
        ok: false,
        error_code: 'INVALID_SCHEMA',
        message: 'engram_memory_forget requires a closed record target.',
      };
    }
    if (
      !hasExactKeys(effectiveInput, [
        'tool_name',
        'record_id',
        'reason_ref',
        'event_id',
        'event_anchor',
      ]) ||
      effectiveInput.record_id !== target.record_id ||
      !isValidOpaqueRef(effectiveInput.reason_ref) ||
      !isValidOpaqueRef(effectiveInput.event_id)
    ) {
      return {
        ok: false,
        error_code: 'INVALID_SCHEMA',
        message:
          'engram_memory_forget effective_input must match target.record_id and contain valid reason_ref, event_id, and event_anchor.',
      };
    }
    const anchor = effectiveInput.event_anchor;
    if (
      !isPlainObject(anchor) ||
      !hasExactKeys(anchor, [
        'occurred_at',
        'kind_ref',
        'provenance_ref',
        'provenance_digest',
      ]) ||
      !isValidInstant(anchor.occurred_at) ||
      !isValidOpaqueRef(anchor.kind_ref) ||
      !isValidOpaqueRef(anchor.provenance_ref) ||
      !isValidSha256Digest(anchor.provenance_digest)
    ) {
      return {
        ok: false,
        error_code: 'INVALID_SCHEMA',
        message: 'Invalid event_anchor in engram_memory_forget effective_input.',
      };
    }
  } else {
    return {
      ok: false,
      error_code: 'INVALID_SCHEMA',
      message: 'Unsupported tool_name in MemoryMutationPreimageV1.',
    };
  }

  return {
    ok: true,
    value: preimage as unknown as MemoryMutationPreimageV1,
  };
}

function stringifyRfc8785JcsPreservingValidatedStrings(value: unknown): string {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stringifyRfc8785JcsPreservingValidatedStrings).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map(
      (k) =>
        `${JSON.stringify(k)}:${stringifyRfc8785JcsPreservingValidatedStrings(obj[k])}`,
    )
    .join(',')}}`;
}

/**
 * Serializes a validated `MemoryMutationPreimageV1` to canonical RFC 8785 JCS
 * UTF-8 text without silently rewriting validated string contents
 * (SPEC-memory-mcp-v3.1.md lines 610, 688).
 */
export function canonicalizeMemoryMutationPreimageJcsV1(
  preimage: unknown,
): PolicyValidationResult<string> {
  const validated = validateMemoryMutationPreimageV1(preimage);
  if (!validated.ok) {
    return validated;
  }
  return {
    ok: true,
    value: stringifyRfc8785JcsPreservingValidatedStrings(validated.value),
  };
}

/**
 * Computes the `sentropic.engram.memory-mutation/v1` operation digest:
 * `sha256:` + 64 lowercase hex digits of `SHA256(UTF8(RFC8785(preimage)))`,
 * with no BOM, trailing newline, or extra domain prefix
 * (SPEC-memory-mcp-v3.1.md line 610).
 */
export function computeMemoryMutationOperationDigestV1(
  preimage: unknown,
): PolicyValidationResult<{
  readonly canonical_jcs_utf8: string;
  readonly operation_digest: Digest;
  readonly policy_versions: MemoryMutationPolicyVersionsV1;
}> {
  const jcsRes = canonicalizeMemoryMutationPreimageJcsV1(preimage);
  if (!jcsRes.ok) {
    return jcsRes;
  }
  const typedPreimage = preimage as MemoryMutationPreimageV1;
  const pvRes = projectMemoryMutationPolicyVersionsV1(
    typedPreimage.effective_input,
  );
  if (!pvRes.ok) {
    return pvRes;
  }
  const hex = createHash('sha256')
    .update(jcsRes.value, 'utf8')
    .digest('hex');
  return {
    ok: true,
    value: {
      canonical_jcs_utf8: jcsRes.value,
      operation_digest: `sha256:${hex}` as Digest,
      policy_versions: pvRes.value,
    },
  };
}

/**
 * Extracts the 9-tuple `MemoryMutationLookupKeyV1` from a `MemoryMutationPreimageV1`
 * (excluding `tool_name`, `target`, and `operation_digest`, per SPEC-memory-mcp-v3.1.md line 694).
 */
export function extractMemoryMutationLookupKeyV1(
  preimage: MemoryMutationPreimageV1,
): MemoryMutationLookupKeyV1 {
  return {
    principal_namespace: preimage.principal_namespace,
    principal_id: preimage.principal_id,
    tenant_id: preimage.tenant_id,
    store_id: preimage.store_id,
    provider_id: preimage.provider_id,
    connector_id: preimage.connector_id,
    connector_instance_ref: preimage.connector_instance_ref,
    scope_ref: preimage.scope_ref,
    idempotency_key: preimage.idempotency_key,
  };
}

export function isSameMemoryMutationLookupKeyV1(
  a: MemoryMutationLookupKeyV1,
  b: MemoryMutationLookupKeyV1,
): boolean {
  return (
    a.principal_namespace === b.principal_namespace &&
    a.principal_id === b.principal_id &&
    a.tenant_id === b.tenant_id &&
    a.store_id === b.store_id &&
    a.provider_id === b.provider_id &&
    a.connector_id === b.connector_id &&
    a.connector_instance_ref === b.connector_instance_ref &&
    a.scope_ref === b.scope_ref &&
    a.idempotency_key === b.idempotency_key
  );
}

/**
 * M5 Durable Idempotent Operation Reservation Key & Record.
 */
export interface DurableOperationKeyV1 {
  readonly principal_namespace: OpaqueRef;
  readonly principal_id: OpaqueRef;
  readonly tenant_id: OpaqueRef;
  readonly store_id: OpaqueRef;
  readonly provider_id: typeof ENGRAM_MEMORY_PROVIDER_ID;
  readonly connector_id: 'engram-memory';
  readonly connector_instance_ref: OpaqueRef;
  readonly scope_ref: OpaqueRef;
  readonly tool_name: MutatingMemoryToolName;
  readonly tool_contract_version: typeof ENGRAM_MEMORY_MCP_CONTRACT_VERSION;
  readonly target_ref: OpaqueRef;
  readonly idempotency_key: IdempotencyKey;
}

export interface CaptureSourceOrderV1 {
  readonly source_ref: OpaqueRef;
  readonly sequence: Cursor;
}

export interface DurableOperationRecordV1<TOutput = unknown> {
  readonly key: DurableOperationKeyV1;
  readonly normalized_input_digest: Digest;
  readonly status: 'in_flight' | 'completed' | 'failed_retryable';
  readonly created_at: Instant;
  readonly audit_id: OpaqueRef;
  readonly execution_generation: Cursor;
  readonly preimage: MemoryMutationPreimageV1;
  readonly policy_versions: MemoryMutationPolicyVersionsV1;
  readonly capture_policy_version?: OpaqueRef;
  readonly admission_policy_version?: OpaqueRef;
  readonly candidate_id?: OpaqueRef;
  readonly source_order?: CaptureSourceOrderV1;
  readonly effective_retention?: RetentionV1;
  readonly effective_reconciliation?: ReconciliationConsentV1;
  readonly event_id?: OpaqueRef;
  readonly event_anchor?: LifecycleEventAnchorV1;
  readonly canonical_replay_ref?: OpaqueRef;
  readonly stored_output?: TOutput;
}

export type IdempotentMutationDecisionV1<TOutput> =
  | { readonly decision: 'execute_new' }
  | {
      readonly decision: 'replay_completed';
      readonly output: TOutput;
    }
  | {
      readonly decision: 'resume_incomplete';
      readonly existing_record: DurableOperationRecordV1<TOutput> | MemoryMutationBindingV1<TOutput>;
    }
  | {
      readonly decision: 'reconcile_canonical';
      readonly canonical_replay_ref: OpaqueRef;
      readonly existing_record: DurableOperationRecordV1<TOutput> | MemoryMutationBindingV1<TOutput>;
    }
  | {
      readonly decision: 'reject';
      readonly error_code:
        | 'DIGEST_CONFLICT'
        | 'UNAUTHORIZED'
        | 'NOT_FOUND'
        | 'FENCE_LOST'
        | 'MUTATION_OUTCOME_UNKNOWN'
        | 'POLICY_STALE'
        | 'INVALID_SCHEMA';
      readonly retriable: boolean;
    };

function applyReplayedOutputMarker<TOutput>(
  toolName: MutatingMemoryToolName,
  storedOutput: TOutput,
): TOutput {
  if (!isPlainObject(storedOutput as unknown)) {
    return storedOutput;
  }
  if (toolName === 'engram_memory_capture') {
    const cap = storedOutput as unknown as CaptureOutputV1;
    return {
      ...cap,
      status: 'duplicate_exact',
    } as unknown as TOutput;
  }
  const transitionOut = storedOutput as unknown as
    | RequestAdmissionOutputV1
    | WithdrawOutputV1
    | ForgetOutputV1;
  return {
    ...transitionOut,
    replayed: true,
  } as unknown as TOutput;
}

/** Compatibility entry: every execution/replay uses the same complete M5 contract. */
export function evaluateIdempotentMutationStateV1<TOutput>(
  existing: DurableOperationRecordV1<TOutput> | undefined,
  incoming: {
    readonly key: DurableOperationKeyV1;
    readonly normalized_input_digest: Digest;
    readonly callerAuthorized?: boolean;
    readonly targetAuthorized?: boolean;
    readonly preimage: MemoryMutationPreimageV1;
    readonly policy_versions: MemoryMutationPolicyVersionsV1;
    readonly active_domain_policy_version?: OpaqueRef;
  },
): IdempotentMutationDecisionV1<TOutput> {
  const targetTool = incoming.key?.tool_name !== 'engram_memory_capture';
  if (incoming.callerAuthorized !== true) {
    return { decision: 'reject', error_code: 'UNAUTHORIZED', retriable: false };
  }
  if (targetTool && incoming.targetAuthorized !== true) {
    return { decision: 'reject', error_code: 'NOT_FOUND', retriable: false };
  }
  const invalid = { decision: 'reject', error_code: 'INVALID_SCHEMA', retriable: false } as const;
  const validRecord = (r: typeof incoming & Pick<DurableOperationRecordV1, 'capture_policy_version' | 'admission_policy_version'>): boolean => {
    const d = computeMemoryMutationOperationDigestV1(r.preimage);
    if (!d.ok || !r.policy_versions || !projectMemoryMutationPolicyVersionsV1(r.preimage.effective_input, r.policy_versions).ok ||
        d.value.operation_digest !== r.normalized_input_digest) return false;
    // M:706: redundant persisted versions cannot contradict the sealed projection.
    if (Object.hasOwn(r, 'capture_policy_version') &&
        (r.policy_versions.tool_name !== 'engram_memory_capture' || r.capture_policy_version !== r.policy_versions.capture_policy_version)) return false;
    if (Object.hasOwn(r, 'admission_policy_version') &&
        (r.policy_versions.tool_name !== 'engram_memory_request_admission' || r.admission_policy_version !== r.policy_versions.admission_policy_version)) return false;
    const pre = r.preimage;
    const target = pre.target.kind === 'capture_source' ? pre.target.source_ref : pre.target.kind === 'candidate' ? pre.target.candidate_id : pre.target.record_id;
    return isSameMemoryMutationLookupKeyV1(r.key, extractMemoryMutationLookupKeyV1(pre)) &&
      r.key.tool_name === pre.tool_name && r.key.tool_contract_version === pre.provider_contract_version && r.key.target_ref === target;
  };
  if (!validRecord(incoming)) return invalid;
  if (existing && (!validRecord(existing) || !isValidInstant(existing.created_at))) return invalid;
  const records: MemoryMutationBindingV1<TOutput>[] = existing ? [{
    lookup_key: extractMemoryMutationLookupKeyV1(existing.preimage), preimage: existing.preimage,
    operation_digest: existing.normalized_input_digest, policy_versions: existing.policy_versions,
    recovery_state: existing.status === 'completed' ? 'completed_response' : existing.status === 'in_flight' ? 'executing_unknown_outcome' : 'authorized_uncommitted',
    stored_output: existing.stored_output, canonical_replay_ref: existing.canonical_replay_ref,
    // This compatibility view does not fabricate host audit/fence context.
    audit_id: existing.audit_id, execution_generation: existing.execution_generation,
  }] : [];
  const decision = evaluatePrincipalScopedMutationLookupV1(records, incoming);
  return (decision.decision === 'resume_incomplete' || decision.decision === 'reconcile_canonical') && existing
    ? { ...decision, existing_record: existing } : decision;
}

/**
 * Evaluates principal-scoped 9-tuple reservation lookup across all four
 * mutating tools (`M5-CROSS-TOOL-KEY`, SPEC-memory-mcp-v3.1.md lines 694–698).
 */
export function evaluatePrincipalScopedMutationLookupV1<TOutput>(
  recordsInStore: readonly MemoryMutationBindingV1<TOutput>[],
  incoming: {
    readonly preimage: MemoryMutationPreimageV1;
    readonly callerAuthorized?: boolean;
    readonly targetAuthorized?: boolean;
    readonly active_domain_policy_version?: OpaqueRef;
  },
): IdempotentMutationDecisionV1<TOutput> {
  if (!incoming.preimage) return { decision: 'reject', error_code: 'INVALID_SCHEMA', retriable: false };
  const isTargetTool = incoming.preimage.tool_name !== 'engram_memory_capture';
  const rawIncoming = incoming as unknown as Record<string, unknown>;

  if (rawIncoming.callerAuthorized !== true) {
    return {
      decision: 'reject',
      error_code: 'UNAUTHORIZED',
      retriable: false,
    };
  }
  if (isTargetTool && rawIncoming.targetAuthorized !== true) {
    return {
      decision: 'reject',
      error_code: 'NOT_FOUND',
      retriable: false,
    };
  }

  const digestRes = computeMemoryMutationOperationDigestV1(incoming.preimage);
  if (!digestRes.ok) {
    return {
      decision: 'reject',
      error_code: 'INVALID_SCHEMA',
      retriable: false,
    };
  }

  const lookupKey = extractMemoryMutationLookupKeyV1(incoming.preimage);
  const existing = recordsInStore.find((r) =>
    isSameMemoryMutationLookupKeyV1(r.lookup_key, lookupKey),
  );
  const effective = incoming.preimage.effective_input;
  const policyVersion = effective.tool_name === 'engram_memory_capture' ? effective.capture_policy_version : effective.tool_name === 'engram_memory_request_admission' ? effective.admission_policy_version : undefined;
  if (!existing) {
    if (policyVersion !== undefined && incoming.active_domain_policy_version !== policyVersion) {
      return { decision: 'reject', error_code: 'POLICY_STALE', retriable: true };
    }
    return { decision: 'execute_new' };
  }

  if (!existing.preimage || !existing.policy_versions) {
    return { decision: 'reject', error_code: 'INVALID_SCHEMA', retriable: false };
  }
  const existingDigestRes = computeMemoryMutationOperationDigestV1(
    existing.preimage,
  );
  const pvConsistency = projectMemoryMutationPolicyVersionsV1(
    existing.preimage.effective_input,
    existing.policy_versions,
  );
  if (
    !existing.policy_versions ||
    !isValidOpaqueRef(existing.audit_id) || existing.audit_id === 'audit_mcp_l0_default' ||
    !isValidCursor(existing.execution_generation) ||
    !existing.preimage ||
    !isSameMemoryMutationLookupKeyV1(existing.lookup_key, extractMemoryMutationLookupKeyV1(existing.preimage)) ||
    !existingDigestRes.ok ||
    !pvConsistency.ok ||
    existingDigestRes.value.operation_digest !== existing.operation_digest
  ) {
    return {
      decision: 'reject',
      error_code: 'INVALID_SCHEMA',
      retriable: false,
    };
  }

  if (
    existing.preimage.tool_name !== incoming.preimage.tool_name ||
    existing.operation_digest !== digestRes.value.operation_digest
  ) {
    return {
      decision: 'reject',
      error_code: 'DIGEST_CONFLICT',
      retriable: false,
    };
  }

  if (
    existing.recovery_state === 'completed_response' ||
    existing.recovery_state === 'canonical_committed_receipt'
  ) {
    if (!isValidOpaqueRef(existing.canonical_replay_ref)) {
      return {
        decision: 'reject',
        error_code: 'MUTATION_OUTCOME_UNKNOWN',
        retriable: true,
      };
    }
    if (existing.stored_output === undefined) {
      // M:704,710: canonical commitment survives an unrecorded host completion.
      return { decision: 'reconcile_canonical', canonical_replay_ref: existing.canonical_replay_ref, existing_record: existing };
    }
    return {
      decision: 'replay_completed',
      output: applyReplayedOutputMarker(
        incoming.preimage.tool_name,
        existing.stored_output,
      ),
    };
  }

  // M5 l.710,730: unknown host state cannot prove the absence of a canonical
  // commit. Reconcile first; the first-effect guard checks current policy
  // only if that canonical lookup finds no committed outcome.
  if (existing.recovery_state === 'executing_unknown_outcome') {
    return { decision: 'reject', error_code: 'MUTATION_OUTCOME_UNKNOWN', retriable: true };
  }

  // M5 l.702: a known uncommitted reservation must use current domain policy.
  const recordedVersion =
    existing.policy_versions.tool_name === 'engram_memory_capture'
      ? existing.policy_versions.capture_policy_version
      : existing.policy_versions.tool_name ===
          'engram_memory_request_admission'
        ? existing.policy_versions.admission_policy_version
        : undefined;
  const staleVersionReject =
    recordedVersion !== undefined &&
    recordedVersion !== incoming.active_domain_policy_version
      ? {
          decision: 'reject',
          error_code: 'POLICY_STALE',
          retriable: true,
        } as const
      : undefined;

  {
    if (staleVersionReject !== undefined) return staleVersionReject;
  }

  if (existing.recovery_state !== 'pending_confirmation' && existing.recovery_state !== 'authorized_uncommitted') {
    return { decision: 'reject', error_code: 'INVALID_SCHEMA', retriable: false };
  }
  return { decision: 'resume_incomplete', existing_record: existing };
}

/**
 * M5 Same-Scope Tombstone Recapture Guard (`A10-R4-RECAPTURE`,
 * SPEC-memory-mcp-v3.1.md lines 712–729, 1391, 1626):
 *
 * Before committing admission, checks whether the candidate's `payload_digest`
 * matches a tombstoned record in the same exact `scope_ref`.
 * - A match in the same scope prevents automatic acceptance and requires
 *   adjudication, returning a **successful domain outcome**:
 *   `ok: true`, `isError: false`, `admission_status: 'pending_adjudication'`,
 *   `effective_decision: 'adjudication_required'`.
 * - It MUST NEVER return `ILLEGAL_TRANSITION` for recapture.
 * - Tombstones in other scopes MUST NOT affect the decision or be disclosed.
 */
export interface SameScopeTombstoneRecaptureOutcomeV1 {
  readonly isError: false;
  readonly matched_same_scope_tombstone: boolean;
  readonly automatic_acceptance_allowed: boolean;
  readonly admission_status:
    | 'accepted'
    | 'rejected'
    | 'pending_adjudication';
  readonly effective_decision: AdmissionDecision;
}

export function evaluateSameScopeTombstoneRecaptureGuardV1(input: {
  readonly scope_ref: OpaqueRef;
  readonly candidate_payload_digest: Digest;
  readonly tombstoned_payload_digests_in_scope:
    | ReadonlySet<Digest>
    | readonly Digest[];
  readonly tombstoned_payload_digests_in_other_scopes?:
    | ReadonlySet<Digest>
    | readonly Digest[];
  readonly ordinary_policy_decision?: AdmissionDecision;
}): PolicyValidationResult<SameScopeTombstoneRecaptureOutcomeV1> {
  if (
    !isValidOpaqueRef(input.scope_ref) ||
    !isValidSha256Digest(input.candidate_payload_digest)
  ) {
    return {
      ok: false,
      error_code: 'INVALID_SCHEMA',
      message: 'Invalid scope_ref or candidate_payload_digest.',
    };
  }

  const ordinaryDecision = input.ordinary_policy_decision;

  // M:525,716-718: absent evidence must never become Set(undefined).
  const evidence = input.tombstoned_payload_digests_in_scope;
  if (!(evidence instanceof Set || Array.isArray(evidence)) ||
      ![...evidence].every(isValidSha256Digest)) {
    return { ok: false, error_code: 'POLICY_UNAVAILABLE', message: 'Explicit same-scope tombstone evidence is required' };
  }
  const tombstonedInSameScope =
    input.tombstoned_payload_digests_in_scope instanceof Set
      ? input.tombstoned_payload_digests_in_scope
      : new Set(input.tombstoned_payload_digests_in_scope);

  if (tombstonedInSameScope.has(input.candidate_payload_digest)) {
    return {
      ok: true,
      value: {
        isError: false,
        matched_same_scope_tombstone: true,
        automatic_acceptance_allowed: false,
        admission_status: 'pending_adjudication',
        effective_decision: 'adjudication_required',
      },
    };
  }

  if (ordinaryDecision !== 'accept' && ordinaryDecision !== 'reject' && ordinaryDecision !== 'adjudication_required') {
    return { ok: false, error_code: 'POLICY_UNAVAILABLE', message: 'An explicit host admission decision is required' };
  }
  const effectiveStatus =
    ordinaryDecision === 'accept'
      ? 'accepted'
      : ordinaryDecision === 'reject'
        ? 'rejected'
        : 'pending_adjudication';

  return {
    ok: true,
    value: {
      isError: false,
      matched_same_scope_tombstone: false,
      automatic_acceptance_allowed: true,
      admission_status: effectiveStatus,
      effective_decision: ordinaryDecision,
    },
  };
}

/**
 * M5 Complete Lifecycle Transition Evaluator
 * (SPEC-memory-mcp-v3.1.md lines 577–588, 712–729).
 */
export type M5LifecycleStateOrAbsent =
  | 'absent'
  | MemoryState
  | 'pending_adjudication';

export type M5LifecycleTransitionEvaluationV1 =
  | {
      readonly ok: true;
      readonly isError: false;
      readonly next_state:
        | 'pending'
        | 'accepted_current'
        | 'rejected'
        | 'pending_adjudication'
        | 'withdrawn'
        | 'tombstoned';
      readonly admission_status?:
        | 'accepted'
        | 'rejected'
        | 'pending_adjudication';
    }
  | {
      readonly ok: false;
      readonly isError: true;
      readonly error_code:
        | 'ILLEGAL_TRANSITION'
        | 'ALREADY_TERMINAL'
        | 'POLICY_UNAVAILABLE'
        | 'UNAUTHORIZED'
        | 'NOT_FOUND';
    };

const TERMINAL_MEMORY_STATES: ReadonlySet<string> = new Set([
  'withdrawn',
  'rejected',
  'tombstoned',
]);

const TOMBSTONE_ALLOWED_SET: ReadonlySet<string> = new Set(
  TOMBSTONE_ALLOWED_FROM_STATES,
);

export function evaluateM5LifecycleTransitionV1(input: {
  readonly tool: MutatingMemoryToolName;
  readonly prior_state: M5LifecycleStateOrAbsent;
  readonly callerAuthorized?: boolean;
  readonly targetAuthorized?: boolean;
  readonly same_scope_tombstone_match?: boolean;
  readonly other_scope_tombstone_match?: boolean;
  readonly policy_decision?: AdmissionDecision;
}): M5LifecycleTransitionEvaluationV1 {
  const isTargetTool = input.tool !== 'engram_memory_capture';
  const raw = input as unknown as Record<string, unknown>;

  if (raw.callerAuthorized !== true) {
    return {
      ok: false,
      isError: true,
      error_code: 'UNAUTHORIZED',
    };
  }
  if (isTargetTool && raw.targetAuthorized !== true) {
    return { ok: false, isError: true, error_code: 'NOT_FOUND' };
  }

  if (input.tool === 'engram_memory_capture') {
    if (input.prior_state === 'absent') {
      return {
        ok: true,
        isError: false,
        next_state: 'pending',
      };
    }
    return {
      ok: false,
      isError: true,
      error_code: 'ILLEGAL_TRANSITION',
    };
  }

  if (input.tool === 'engram_memory_request_admission') {
    if (TERMINAL_MEMORY_STATES.has(input.prior_state)) {
      return {
        ok: false,
        isError: true,
        error_code: 'ALREADY_TERMINAL',
      };
    }
    if (input.prior_state !== 'pending') {
      return {
        ok: false,
        isError: true,
        error_code: 'ILLEGAL_TRANSITION',
      };
    }
    if (input.same_scope_tombstone_match === true) {
      return {
        ok: true,
        isError: false,
        next_state: 'pending_adjudication',
        admission_status: 'pending_adjudication',
      };
    }
    // M:525,716-718: only an explicit negative match permits ordinary admission.
    if (input.same_scope_tombstone_match !== false) {
      return { ok: false, isError: true, error_code: 'POLICY_UNAVAILABLE' };
    }
    const decision = input.policy_decision;
    if (decision !== 'accept' && decision !== 'reject' && decision !== 'adjudication_required') {
      return { ok: false, isError: true, error_code: 'POLICY_UNAVAILABLE' };
    }
    if (decision === 'accept') {
      return {
        ok: true,
        isError: false,
        next_state: 'accepted_current',
        admission_status: 'accepted',
      };
    }
    if (decision === 'reject') {
      return {
        ok: true,
        isError: false,
        next_state: 'rejected',
        admission_status: 'rejected',
      };
    }
    return {
      ok: true,
      isError: false,
      next_state: 'pending_adjudication',
      admission_status: 'pending_adjudication',
    };
  }

  if (input.tool === 'engram_memory_withdraw') {
    if (TERMINAL_MEMORY_STATES.has(input.prior_state)) {
      return {
        ok: false,
        isError: true,
        error_code: 'ALREADY_TERMINAL',
      };
    }
    if (input.prior_state === 'pending') {
      return {
        ok: true,
        isError: false,
        next_state: 'withdrawn',
      };
    }
    return {
      ok: false,
      isError: true,
      error_code: 'ILLEGAL_TRANSITION',
    };
  }

  if (TERMINAL_MEMORY_STATES.has(input.prior_state)) {
    return {
      ok: false,
      isError: true,
      error_code: 'ALREADY_TERMINAL',
    };
  }
  if (TOMBSTONE_ALLOWED_SET.has(input.prior_state)) {
    return {
      ok: true,
      isError: false,
      next_state: 'tombstoned',
    };
  }
  return {
    ok: false,
    isError: true,
    error_code: 'ILLEGAL_TRANSITION',
  };
}

// ============================================================================
// 11. L0-A03 Verified Invocation Binding & Context Projection
// ============================================================================

export type ChannelBindingKindV1 =
  | 'in_process_verified'
  | 'stdio_host_managed_verified'
  | 'http_mcp_auth_dpop_verified'
  | 'http_mcp_auth_bearer_verified';

export interface DelegationBindingV1 {
  readonly delegator_principal_id: OpaqueRef;
  readonly delegate_principal_id: OpaqueRef;
  readonly delegation_receipt_digest: Digest;
  readonly verified_by_host_resolver: boolean;
  readonly expires_at: Instant;
}

export type DestructiveMemoryToolName =
  | 'engram_memory_withdraw'
  | 'engram_memory_forget';

/**
 * L0-A03 closed host invocation binding across catalog, execution seam,
 * broker, mesh transport, and provider.
 * Note: Per Sentropic co-freeze (`open-points-answers-v3.1.md:9-10`),
 * `ScopeRefV1` and `PrincipalRefV1` are NOT declared as public types;
 * scope and principal projection live inside `MemoryInvocationBindingV1`
 * and `MemoryContextProjectionV1`.
 */
export interface MemoryInvocationBindingV1 {
  readonly issuer: OpaqueRef;
  readonly sub: OpaqueRef;
  readonly tid: OpaqueRef;
  readonly claims: readonly string[];
  readonly claims_provenance_receipt: Digest;
  readonly principal_namespace: OpaqueRef;
  readonly principal_id: OpaqueRef;
  readonly tenant_id: OpaqueRef;
  readonly tenant_membership_receipt: Digest;
  readonly tenant_resolution_source: 'authoritative_membership';
  readonly workspace_id?: OpaqueRef;
  readonly agent_id: OpaqueRef;
  readonly mcp_client_id: OpaqueRef;
  readonly logical_session_ref: OpaqueRef;
  readonly transport_attachment_ref: OpaqueRef;
  readonly connection_proof_digest: Digest;
  readonly publisher_id: 'sentropic.engram.memory';
  readonly provider_id: 'sentropic.engram.memory';
  readonly connector_id: 'engram-memory';
  readonly connector_instance_ref: OpaqueRef;
  readonly selected_source_id: 'mcp:engram-memory';
  readonly store_id: OpaqueRef;
  readonly scope_ref: OpaqueRef;
  readonly purpose_ref: OpaqueRef;
  readonly active_generation: Cursor;
  readonly policy_epoch: Cursor;
  readonly audit_id: OpaqueRef;
  readonly correlation_ref: OpaqueRef;
  readonly deadline_at: Instant;
  readonly cancellation_ref: OpaqueRef;
  readonly issued_at: Instant;
  readonly channel_binding: ChannelBindingKindV1;
  readonly transport_scopes: readonly ('mcp:discover' | 'mcp:tools:invoke')[];
  readonly idempotency_key?: IdempotencyKey;
  readonly elicitation_ref?: OpaqueRef;
  readonly delegation?: DelegationBindingV1;
  readonly neutral_credential: string;
  readonly neutral_context_ref?: OpaqueRef;
}

export interface MemoryContextProjectionV1 {
  readonly agent_id: OpaqueRef;
  readonly purpose_ref: OpaqueRef;
  readonly delegation?: DelegationBindingV1;
  readonly trusted_context: TrustedInvocationContextV1;
  readonly neutral_authorization: AuthorizationContextV1;
  readonly neutral_scope_ref: OpaqueRef;
  readonly neutral_principal: {
    readonly principal_namespace: OpaqueRef;
    readonly principal_id: OpaqueRef;
    readonly tenant_id: OpaqueRef;
  };
  readonly verified_claims: {
    readonly issuer: OpaqueRef;
    readonly sub: OpaqueRef;
    readonly tid: OpaqueRef;
    readonly claims_provenance_receipt: Digest;
    readonly tenant_membership_receipt: Digest;
  };
  readonly lifecycle_binding: { readonly deadline_at: Instant; readonly cancellation_ref: OpaqueRef };
  readonly channel_binding: ChannelBindingKindV1;
  readonly transport_scopes: readonly ('mcp:discover' | 'mcp:tools:invoke')[];
  readonly session_attachment: {
    readonly mcp_client_id: OpaqueRef;
    readonly logical_session_ref: OpaqueRef;
    readonly transport_attachment_ref: OpaqueRef;
    readonly connection_proof_digest: Digest;
  };
  readonly routing_provenance: {
    readonly publisher_id: 'sentropic.engram.memory';
    readonly provider_id: 'sentropic.engram.memory';
    readonly connector_id: 'engram-memory';
    readonly connector_instance_ref: OpaqueRef;
    readonly selected_source_id: 'mcp:engram-memory';
    readonly active_generation: Cursor;
    readonly policy_epoch: Cursor;
  };
  readonly envelope_bindings: {
    readonly idempotency_key?: IdempotencyKey;
    readonly elicitation_ref?: OpaqueRef;
    readonly audit_id: OpaqueRef;
    readonly correlation_ref: OpaqueRef;
  };
}

export type MemoryContextProjectionResultV1 =
  | {
      readonly ok: true;
      readonly value: MemoryContextProjectionV1;
    }
  | {
      readonly ok: false;
      readonly kind: 'protocol_refusal';
      readonly protocolError: McpProtocolErrorObjectV1;
    }
  | {
      readonly ok: false;
      readonly error_code:
        | 'UNAUTHORIZED'
        | 'AUTHORIZATION_REVOKED'
        | 'POLICY_STALE'
        | 'INVALID_SCHEMA';
      readonly reason: string;
    };

const MEMORY_INVOCATION_BINDING_KEYS = new Set<string>([
  'issuer',
  'sub',
  'tid',
  'claims',
  'claims_provenance_receipt',
  'principal_namespace',
  'principal_id',
  'tenant_id',
  'tenant_membership_receipt',
  'tenant_resolution_source',
  'workspace_id',
  'agent_id',
  'mcp_client_id',
  'logical_session_ref',
  'transport_attachment_ref',
  'connection_proof_digest',
  'publisher_id',
  'provider_id',
  'connector_id',
  'connector_instance_ref',
  'selected_source_id',
  'store_id',
  'scope_ref',
  'purpose_ref',
  'active_generation',
  'policy_epoch',
  'audit_id',
  'correlation_ref',
  'deadline_at',
  'cancellation_ref',
  'issued_at',
  'channel_binding',
  'transport_scopes',
  'idempotency_key',
  'elicitation_ref',
  'delegation',
  'neutral_credential',
  'neutral_context_ref',
]);

function hasUnexpectedObjectKeys(
  obj: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
): string | null {
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.has(key)) {
      return key;
    }
  }
  return null;
}

function parseInstantMs(value: unknown): number | null {
  if (!isValidInstant(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function checkDelegationBinding(
  delegation: unknown,
  nowIso: Instant,
): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
  if (!isPlainObject(delegation)) {
    return { ok: false, reason: 'DelegationBindingV1 must be a plain object' };
  }
  if (!hasExactKeys(delegation, ['delegator_principal_id', 'delegate_principal_id', 'delegation_receipt_digest', 'verified_by_host_resolver', 'expires_at']) || delegation.verified_by_host_resolver !== true) {
    return {
      ok: false,
      reason: 'Delegation must have verified_by_host_resolver === true',
    };
  }
  if (
    !isValidOpaqueRef(delegation.delegator_principal_id) ||
    !isValidOpaqueRef(delegation.delegate_principal_id) ||
    !isValidSha256Digest(delegation.delegation_receipt_digest)
  ) {
    return {
      ok: false,
      reason: 'Delegation principal IDs or receipt digest invalid',
    };
  }
  const nowMs = parseInstantMs(nowIso);
  const expMs = parseInstantMs(delegation.expires_at);
  if (nowMs === null || expMs === null || nowMs >= expMs) {
    return { ok: false, reason: 'Delegation is expired or has invalid timestamp' };
  }
  return { ok: true };
}

/**
 * Projects a verified `MemoryInvocationBindingV1` into the provider's
 * `TrustedInvocationContextV1` and framework-free neutral `AuthorizationContextV1`.
 * Rejects `claims: []`, missing `sub`/`tid`, workspace-as-tenant substitution,
 * synthetic `audit_mcp_l0_default`, mismatched out-of-arguments `idempotencyKey`,
 * stale generation/policy epoch, and unverified delegation before any effect.
 */
/** Current host-owned expectations, required at every invocation/effect guard. */
export interface ExpectedMemoryInvocationContextV1 {
  readonly tool: EngramMemoryToolName;
  readonly expectedActiveGeneration: Cursor;
  readonly expectedPolicyEpoch: Cursor;
  readonly now: Instant;
  readonly confirmationRequired: boolean;
  readonly argumentIdempotencyKey?: IdempotencyKey;
  readonly argumentPurposeRef?: OpaqueRef;
}

export function projectMemoryInvocationContextV1(
  binding: unknown,
  expected: ExpectedMemoryInvocationContextV1,
): MemoryContextProjectionResultV1 {
  // M:322-326,785: audit refusal precedes all domain checks and envelopes.
  if (!isPlainObject(binding) || !isValidTrustedAuditId(binding.audit_id)) {
    return { ok: false, kind: 'protocol_refusal', protocolError: TRUSTED_CONTEXT_UNAVAILABLE_PROTOCOL_ERROR };
  }
  if (!expected || !ENGRAM_MEMORY_TOOL_NAMES.includes(expected.tool) ||
      !isValidCursor(expected.expectedActiveGeneration) || !isValidCursor(expected.expectedPolicyEpoch) ||
      !isValidInstant(expected.now) || typeof expected.confirmationRequired !== 'boolean') {
    return { ok: false, error_code: 'UNAUTHORIZED', reason: 'Current host generation, policy epoch, tool, time and confirmation policy are required' };
  }
  const unexpected = hasUnexpectedObjectKeys(
    binding,
    MEMORY_INVOCATION_BINDING_KEYS,
  );
  if (unexpected !== null) {
    return {
      ok: false,
      error_code: 'UNAUTHORIZED',
      reason: `MemoryInvocationBindingV1 contains unexpected field '${unexpected}'`,
    };
  }

  if (
    !isValidOpaqueRef(binding.issuer) ||
    !isValidOpaqueRef(binding.sub) ||
    !isValidOpaqueRef(binding.tid)
  ) {
    return {
      ok: false,
      error_code: 'UNAUTHORIZED',
      reason: 'issuer, sub, and tid must be valid OpaqueRefs',
    };
  }

  if (
    !Array.isArray(binding.claims) ||
    !binding.claims.includes('sub') ||
    !binding.claims.includes('tid')
  ) {
    return {
      ok: false,
      error_code: 'UNAUTHORIZED',
      reason:
        "claims must include verified 'sub' and 'tid' (claims:[] shortcut is forbidden)",
    };
  }

  if (
    !isValidSha256Digest(binding.claims_provenance_receipt) ||
    !isValidSha256Digest(binding.tenant_membership_receipt) ||
    !isValidSha256Digest(binding.connection_proof_digest)
  ) {
    return {
      ok: false,
      error_code: 'UNAUTHORIZED',
      reason:
        'claims_provenance_receipt, tenant_membership_receipt, and connection_proof_digest must be valid sha256 digests',
    };
  }

  if (binding.tenant_resolution_source !== 'authoritative_membership') {
    return {
      ok: false,
      error_code: 'UNAUTHORIZED',
      reason:
        "tenant_resolution_source must equal 'authoritative_membership' (workspace_id cannot substitute for tenant)",
    };
  }

  if (
    !isValidOpaqueRef(binding.tenant_id) ||
    binding.tenant_id !== binding.tid
  ) {
    return {
      ok: false,
      error_code: 'UNAUTHORIZED',
      reason: 'tenant_id must match verified tid claim from authoritative membership',
    };
  }

  if (
    binding.workspace_id !== undefined &&
    !isValidOpaqueRef(binding.workspace_id)
  ) {
    return {
      ok: false,
      error_code: 'UNAUTHORIZED',
      reason: 'workspace_id must be a valid OpaqueRef when present',
    };
  }

  if (
    !isValidOpaqueRef(binding.principal_namespace) ||
    !isValidOpaqueRef(binding.principal_id) ||
    !isValidOpaqueRef(binding.agent_id) ||
    !isValidOpaqueRef(binding.mcp_client_id) ||
    !isValidOpaqueRef(binding.logical_session_ref) ||
    !isValidOpaqueRef(binding.transport_attachment_ref) ||
    !isValidOpaqueRef(binding.connector_instance_ref) ||
    !isValidOpaqueRef(binding.store_id) ||
    !isValidOpaqueRef(binding.scope_ref) ||
    !isValidOpaqueRef(binding.purpose_ref) ||
    !isValidOpaqueRef(binding.correlation_ref) ||
    !isValidOpaqueRef(binding.cancellation_ref)
  ) {
    return {
      ok: false,
      error_code: 'UNAUTHORIZED',
      reason: 'Required principal, session, attachment, store, scope, purpose, or correlation refs are invalid',
    };
  }

  if (
    binding.publisher_id !== 'sentropic.engram.memory' ||
    binding.provider_id !== 'sentropic.engram.memory' ||
    binding.connector_id !== 'engram-memory' ||
    binding.selected_source_id !== 'mcp:engram-memory'
  ) {
    return {
      ok: false,
      error_code: 'UNAUTHORIZED',
      reason: 'publisher_id, provider_id, connector_id, or selected_source_id mismatch',
    };
  }

  if (
    !isValidCursor(binding.active_generation) ||
    !isValidCursor(binding.policy_epoch)
  ) {
    return {
      ok: false,
      error_code: 'UNAUTHORIZED',
      reason: 'active_generation and policy_epoch must be canonical u64 strings',
    };
  }

  if (
    binding.active_generation !== expected.expectedActiveGeneration
  ) {
    return {
      ok: false,
      error_code: 'AUTHORIZATION_REVOKED',
      reason: 'Invocation binding active_generation does not match current active generation',
    };
  }

  if (
    binding.policy_epoch !== expected.expectedPolicyEpoch
  ) {
    return {
      ok: false,
      error_code: 'POLICY_STALE',
      reason: 'Invocation binding policy_epoch does not match current policy epoch',
    };
  }

  if (
    typeof binding.neutral_credential !== 'string' ||
    binding.neutral_credential.trim().length === 0 ||
    utf8ByteLength(binding.neutral_credential) > 4096
  ) {
    return {
      ok: false,
      error_code: 'UNAUTHORIZED',
      reason: 'neutral_credential must be a non-empty bounded credential string',
    };
  }

  if (
    binding.neutral_context_ref !== undefined &&
    !isValidOpaqueRef(binding.neutral_context_ref)
  ) {
    return {
      ok: false,
      error_code: 'UNAUTHORIZED',
      reason: 'neutral_context_ref must be a valid OpaqueRef when present',
    };
  }

  const mutating = expected.tool !== 'engram_memory_search' && expected.tool !== 'engram_memory_get';
  if (mutating && (!isValidIdempotencyKey(binding.idempotency_key) || !isValidIdempotencyKey(expected.argumentIdempotencyKey))) {
    return {
      ok: false,
      error_code: 'INVALID_SCHEMA',
      reason: 'AppInvocationEnvelope.idempotencyKey is required for mutating tools',
    };
  }

  if (
    binding.idempotency_key !== undefined &&
    !isValidIdempotencyKey(binding.idempotency_key)
  ) {
    return {
      ok: false,
      error_code: 'INVALID_SCHEMA',
      reason: 'AppInvocationEnvelope.idempotencyKey is invalid',
    };
  }

  if (
    binding.idempotency_key !== undefined &&
    expected.argumentIdempotencyKey !== undefined &&
    binding.idempotency_key !== expected.argumentIdempotencyKey
  ) {
    return {
      ok: false,
      error_code: 'INVALID_SCHEMA',
      reason: 'AppInvocationEnvelope.idempotencyKey must equal argument idempotency_key',
    };
  }

  if ((DESTRUCTIVE_TOOL_SET.has(expected.tool) || expected.confirmationRequired) && !isValidOpaqueRef(binding.elicitation_ref)) {
    return {
      ok: false,
      error_code: 'UNAUTHORIZED',
      reason: 'AppInvocationEnvelope.elicitationRef is required for confirmation-gated tools',
    };
  }

  const hasPurposeArgument = expected.tool === 'engram_memory_search' || expected.tool === 'engram_memory_get' || expected.tool === 'engram_memory_capture';
  if ((hasPurposeArgument && !isValidOpaqueRef(expected.argumentPurposeRef)) ||
      (expected.argumentPurposeRef !== undefined && binding.purpose_ref !== expected.argumentPurposeRef)) {
    return { ok: false, error_code: 'UNAUTHORIZED', reason: 'Argument purpose must match the trusted purpose binding' };
  }

  if (
    binding.elicitation_ref !== undefined &&
    !isValidOpaqueRef(binding.elicitation_ref)
  ) {
    return {
      ok: false,
      error_code: 'UNAUTHORIZED',
      reason: 'AppInvocationEnvelope.elicitationRef must be a valid OpaqueRef',
    };
  }

  if (!['in_process_verified', 'stdio_host_managed_verified', 'http_mcp_auth_dpop_verified', 'http_mcp_auth_bearer_verified'].includes(binding.channel_binding as string) ||
      !Array.isArray(binding.transport_scopes) ||
      !binding.transport_scopes.includes('mcp:tools:invoke') ||
      binding.transport_scopes.some((s) => s !== 'mcp:discover' && s !== 'mcp:tools:invoke') ||
      new Set(binding.transport_scopes).size !== binding.transport_scopes.length) {
    return { ok: false, error_code: 'UNAUTHORIZED', reason: 'A verified channel and invocation transport scope are required' };
  }

  const issuedMs = parseInstantMs(binding.issued_at);
  const deadlineMs = parseInstantMs(binding.deadline_at);
  const nowMs = parseInstantMs(expected.now)!;
  if (issuedMs === null || deadlineMs === null || nowMs < issuedMs || nowMs >= deadlineMs || deadlineMs <= issuedMs || deadlineMs - issuedMs > MEMORY_MCP_LIMITS.MAX_INVOCATION_DEADLINE_MS) {
    return {
      ok: false,
      error_code: 'UNAUTHORIZED',
      reason: 'issued_at and deadline_at must be valid UTC instants with deadline_at > issued_at',
    };
  }

  if (binding.delegation !== undefined) {
    if (!isPlainObject(binding.delegation) ||
        binding.delegation.delegate_principal_id !== binding.principal_id) {
      return { ok: false, error_code: 'UNAUTHORIZED', reason: 'Delegation must bind the invoking principal as delegate' };
    }
    const delCheck = checkDelegationBinding(
      binding.delegation,
      expected.now,
    );
    if (!delCheck.ok) {
      return {
        ok: false,
        error_code: 'UNAUTHORIZED',
        reason: delCheck.reason,
      };
    }
  }

  const neutral_authorization: AuthorizationContextV1 =
    binding.neutral_context_ref !== undefined
      ? {
          credential: binding.neutral_credential,
          context_ref: binding.neutral_context_ref,
        }
      : {
          credential: binding.neutral_credential,
        };

  const trustedCheck = validateTrustedInvocationContextV1({
    principal_id: binding.principal_id,
    principal_namespace: binding.principal_namespace,
    tenant_id: binding.tenant_id,
    store_id: binding.store_id,
    connector_id: binding.connector_id,
    scope_ref: binding.scope_ref,
    mcp_client_id: binding.mcp_client_id,
    session_id: binding.logical_session_ref,
    correlation_id: binding.correlation_ref,
    now_utc: expected.now,
    deadline_ms: deadlineMs - nowMs,
    authorization_context: neutral_authorization,
    policy_epoch: binding.policy_epoch,
  });

  if (!trustedCheck.ok) {
    return {
      ok: false,
      error_code: 'UNAUTHORIZED',
      reason: trustedCheck.message,
    };
  }

  const b = binding as unknown as MemoryInvocationBindingV1;

  return {
    ok: true,
    value: {
      agent_id: b.agent_id,
      purpose_ref: b.purpose_ref,
      ...(b.delegation !== undefined ? { delegation: { ...b.delegation } } : {}),
      trusted_context: trustedCheck.value,
      neutral_authorization,
      neutral_scope_ref: b.scope_ref,
      neutral_principal: {
        principal_namespace: b.principal_namespace,
        principal_id: b.principal_id,
        tenant_id: b.tenant_id,
      },
      verified_claims: {
        issuer: b.issuer,
        sub: b.sub,
        tid: b.tid,
        claims_provenance_receipt: b.claims_provenance_receipt,
        tenant_membership_receipt: b.tenant_membership_receipt,
      },
      lifecycle_binding: { deadline_at: b.deadline_at, cancellation_ref: b.cancellation_ref },
      channel_binding: b.channel_binding,
      transport_scopes: [...b.transport_scopes],
      session_attachment: {
        mcp_client_id: b.mcp_client_id,
        logical_session_ref: b.logical_session_ref,
        transport_attachment_ref: b.transport_attachment_ref,
        connection_proof_digest: b.connection_proof_digest,
      },
      routing_provenance: {
        publisher_id: 'sentropic.engram.memory',
        provider_id: 'sentropic.engram.memory',
        connector_id: 'engram-memory',
        connector_instance_ref: b.connector_instance_ref,
        selected_source_id: 'mcp:engram-memory',
        active_generation: b.active_generation,
        policy_epoch: b.policy_epoch,
      },
      envelope_bindings: {
        ...(b.idempotency_key !== undefined
          ? { idempotency_key: b.idempotency_key }
          : {}),
        ...(b.elicitation_ref !== undefined
          ? { elicitation_ref: b.elicitation_ref }
          : {}),
        audit_id: b.audit_id,
        correlation_ref: b.correlation_ref,
      },
    },
  };
}

// ============================================================================
// 12. L0-A06 Enrolled OIDC/2FA Confirmation Assurance & Continuation
// ============================================================================

export interface MemoryConfirmationAssuranceV1 {
  readonly enrolled_oidc_domain: 'sent-tech.ca';
  readonly issuer: OpaqueRef;
  readonly approving_subject_sub: OpaqueRef;
  readonly approving_human_principal_id: OpaqueRef;
  readonly enrollment_receipt_digest: Digest;
  readonly step_up_2fa_receipt_digest: Digest;
  readonly assurance_policy_version: OpaqueRef;
  readonly authenticated: boolean;
  readonly enrolled_2fa: boolean;
  readonly step_up_assurance_verified: boolean;
  readonly hardware_key_required: false;
  readonly identity_source: 'enrolled_oidc_2fa';
  readonly delegation?: DelegationBindingV1;
}

export interface MemoryLogicalSessionReattachmentProofV1 {
  readonly previous_attachment_ref: OpaqueRef;
  readonly current_attachment_ref: OpaqueRef;
  readonly reattachment_receipt_digest: Digest;
  readonly verified: boolean;
  readonly admitted_generation: Cursor;
}

export interface MemoryConfirmationContinuationV1 {
  readonly continuation_ref: OpaqueRef;
  readonly elicitation_ref: OpaqueRef;
  readonly mode: 'confirm';
  readonly capability: DestructiveMemoryToolName;
  readonly provider_id: 'sentropic.engram.memory';
  readonly provider_contract_version: '1.0.0';
  readonly connector_id: 'engram-memory';
  readonly connector_instance_ref: OpaqueRef;
  readonly tenant_id: OpaqueRef;
  readonly initiating_principal_namespace: OpaqueRef;
  readonly initiating_principal_id: OpaqueRef;
  readonly agent_id: OpaqueRef;
  readonly mcp_client_id: OpaqueRef;
  readonly logical_session_ref: OpaqueRef;
  readonly transport_attachment_ref: OpaqueRef;
  readonly active_generation: Cursor;
  readonly store_id: OpaqueRef;
  readonly scope_ref: OpaqueRef;
  readonly target_ref: OpaqueRef;
  readonly reservation_ref: OpaqueRef;
  readonly operation_digest: Digest;
  readonly approved: boolean;
  readonly issued_at: Instant;
  readonly expires_at: Instant;
  readonly assurance: MemoryConfirmationAssuranceV1;
  readonly reattachment_proof?: MemoryLogicalSessionReattachmentProofV1;
}

export interface ExpectedConfirmationContinuationBindingV1 {
  readonly elicitation_ref: OpaqueRef;
  readonly capability: DestructiveMemoryToolName;
  readonly provider_id: 'sentropic.engram.memory';
  readonly provider_contract_version: '1.0.0';
  readonly connector_id: 'engram-memory';
  readonly connector_instance_ref: OpaqueRef;
  readonly tenant_id: OpaqueRef;
  readonly initiating_principal_namespace: OpaqueRef;
  readonly initiating_principal_id: OpaqueRef;
  readonly agent_id: OpaqueRef;
  readonly mcp_client_id: OpaqueRef;
  readonly logical_session_ref: OpaqueRef;
  readonly transport_attachment_ref: OpaqueRef;
  readonly active_generation: Cursor;
  readonly store_id: OpaqueRef;
  readonly scope_ref: OpaqueRef;
  readonly target_ref: OpaqueRef;
  readonly reservation_ref: OpaqueRef;
  readonly operation_digest: Digest;
  readonly now: Instant;
  readonly execution_deadline_at: Instant;
  readonly caller_currently_authorized?: unknown;
  readonly target_currently_authorized?: unknown;
  /** M:559,561,567: fresh host checks for this exact approving identity/configuration. */
  readonly approving_human_principal_id: OpaqueRef;
  readonly approving_subject_sub: OpaqueRef;
  readonly approver_currently_enrolled_2fa: unknown;
  readonly approver_not_revoked: unknown;
  readonly approver_current_assurance_verified: unknown;
  readonly expected_issuer: OpaqueRef;
  readonly accepted_assurance_policy_versions: readonly OpaqueRef[];
  readonly host_deployment_qualified: unknown;
  readonly reservation_state: 'uncommitted' | 'committed' | 'unknown';
}

export type ConfirmationContinuationDecisionV1 =
  | {
      readonly ok: true;
      readonly decision:
        | 'execute_confirmed'
        | 'disclose_committed_without_repeat_effect';
      readonly continuation: MemoryConfirmationContinuationV1;
    }
  | {
      readonly ok: false;
      readonly error_code:
        | 'gate_failed'
        | 'UNAUTHORIZED'
        | 'NOT_FOUND'
        | 'MUTATION_OUTCOME_UNKNOWN';
      readonly reason: string;
    };

const CONFIRMATION_ASSURANCE_KEYS = new Set<string>([
  'enrolled_oidc_domain',
  'issuer',
  'approving_subject_sub',
  'approving_human_principal_id',
  'enrollment_receipt_digest',
  'step_up_2fa_receipt_digest',
  'assurance_policy_version',
  'authenticated',
  'enrolled_2fa',
  'step_up_assurance_verified',
  'hardware_key_required',
  'identity_source',
  'delegation',
]);

const CONFIRMATION_CONTINUATION_KEYS = new Set<string>([
  'continuation_ref',
  'elicitation_ref',
  'mode',
  'capability',
  'provider_id',
  'provider_contract_version',
  'connector_id',
  'connector_instance_ref',
  'tenant_id',
  'initiating_principal_namespace',
  'initiating_principal_id',
  'agent_id',
  'mcp_client_id',
  'logical_session_ref',
  'transport_attachment_ref',
  'active_generation',
  'store_id',
  'scope_ref',
  'target_ref',
  'reservation_ref',
  'operation_digest',
  'approved',
  'issued_at',
  'expires_at',
  'assurance',
  'reattachment_proof',
]);

const DESTRUCTIVE_TOOL_SET = new Set<string>([
  'engram_memory_withdraw',
  'engram_memory_forget',
]);

/**
 * Verifies L0-A06 enrolled OIDC/2FA confirmation assurance and durable
 * logical-session continuation.
 *
 * Enforces:
 * - Closed-world literal `true` on `caller_currently_authorized` and `target_currently_authorized`.
 * - Separate literal `true` checks for `authenticated`, `enrolled_2fa`,
 *   `step_up_assurance_verified`, and `approved`.
 * - Enrolled OIDC domain `'sent-tech.ca'`, `hardware_key_required: false`,
 *   and `identity_source: 'enrolled_oidc_2fa'` (rejecting email-only, model
 *   assertion, service principal, or unverified `amr/acr`).
 * - `now < expires_at`, TTL <= 300s, execution window <= 30s.
 * - Logical-session reconnect via verified `reattachment_proof` and generation match;
 *   new logical session requires fresh confirmation for uncommitted work.
 * - Already-committed result (`reservation_state === 'committed'`) may be disclosed
 *   after confirmation expiry under fresh current authorization without repeating effect.
 */
export function verifyMemoryConfirmationContinuationV1(
  continuation: unknown,
  expected: ExpectedConfirmationContinuationBindingV1,
): ConfirmationContinuationDecisionV1 {
  if (expected.caller_currently_authorized !== true) {
    return {
      ok: false,
      error_code: 'UNAUTHORIZED',
      reason: 'Caller current authorization verdict must be literal true',
    };
  }
  if (expected.target_currently_authorized !== true) {
    return {
      ok: false,
      error_code: 'NOT_FOUND',
      reason: 'Target current authorization verdict must be literal true',
    };
  }

  if (expected.approver_currently_enrolled_2fa !== true ||
      expected.approver_not_revoked !== true ||
      expected.approver_current_assurance_verified !== true ||
      expected.host_deployment_qualified !== true) {
    return { ok: false, error_code: 'gate_failed', reason: 'Current approver enrollment, revocation, assurance and host qualification must be literal true' };
  }

  if (!['uncommitted', 'committed', 'unknown'].includes(expected.reservation_state)) {
    return { ok: false, error_code: 'gate_failed', reason: 'Durable reservation state is required' };
  }
  if (expected.reservation_state === 'unknown') {
    return {
      ok: false,
      error_code: 'MUTATION_OUTCOME_UNKNOWN',
      reason: 'Unresolved mutation outcome must reconcile canonical replay evidence before effect',
    };
  }

  if (!isPlainObject(continuation)) {
    return {
      ok: false,
      error_code: 'gate_failed',
      reason: 'MemoryConfirmationContinuationV1 must be a plain object',
    };
  }
  const unexpectedKey = hasUnexpectedObjectKeys(
    continuation,
    CONFIRMATION_CONTINUATION_KEYS,
  );
  if (unexpectedKey !== null) {
    return {
      ok: false,
      error_code: 'gate_failed',
      reason: `MemoryConfirmationContinuationV1 has unexpected key '${unexpectedKey}'`,
    };
  }

  // M:1602,561,565: required fields cannot disappear from both sides of equality.
  const requiredRefs = ['connector_instance_ref', 'tenant_id', 'initiating_principal_namespace', 'initiating_principal_id', 'agent_id', 'mcp_client_id', 'logical_session_ref', 'transport_attachment_ref', 'store_id', 'scope_ref', 'reservation_ref'] as const;
  const validTargetRef = continuation.capability === 'engram_memory_withdraw' ? isValidCandidateId : isValidOpaqueRef;
  if (requiredRefs.some(k => !isValidOpaqueRef(continuation[k]) || !isValidOpaqueRef(expected[k])) ||
      !validTargetRef(continuation.target_ref) || !validTargetRef(expected.target_ref) ||
      !isValidCursor(continuation.active_generation) || !isValidCursor(expected.active_generation)) {
    return { ok: false, error_code: 'gate_failed', reason: 'Required continuation and current binding references must be present and valid' };
  }

  if (
    !isValidOpaqueRef(continuation.continuation_ref) ||
    !isValidOpaqueRef(continuation.elicitation_ref) ||
    continuation.mode !== 'confirm' ||
    !DESTRUCTIVE_TOOL_SET.has(continuation.capability as string) ||
    continuation.capability !== expected.capability ||
    continuation.provider_id !== 'sentropic.engram.memory' ||
    continuation.provider_id !== expected.provider_id ||
    continuation.provider_contract_version !== '1.0.0' ||
    continuation.provider_contract_version !== expected.provider_contract_version ||
    continuation.connector_id !== 'engram-memory' ||
    continuation.connector_id !== expected.connector_id ||
    continuation.connector_instance_ref !== expected.connector_instance_ref ||
    continuation.tenant_id !== expected.tenant_id ||
    continuation.initiating_principal_namespace !==
      expected.initiating_principal_namespace ||
    continuation.initiating_principal_id !== expected.initiating_principal_id ||
    continuation.agent_id !== expected.agent_id ||
    continuation.mcp_client_id !== expected.mcp_client_id ||
    continuation.store_id !== expected.store_id ||
    continuation.scope_ref !== expected.scope_ref ||
    continuation.target_ref !== expected.target_ref ||
    continuation.reservation_ref !== expected.reservation_ref ||
    !isValidSha256Digest(continuation.operation_digest) ||
    continuation.operation_digest !== expected.operation_digest
  ) {
    return {
      ok: false,
      error_code: 'gate_failed',
      reason: 'Confirmation continuation identity, target, reservation, or operation_digest mismatch',
    };
  }

  if (continuation.elicitation_ref !== expected.elicitation_ref) {
    return {
      ok: false,
      error_code: 'gate_failed',
      reason: 'elicitation_ref mismatch for confirmation',
    };
  }

  if (continuation.approved !== true) {
    return {
      ok: false,
      error_code: 'gate_failed',
      reason: 'Confirmation response approved must be literal true',
    };
  }

  if (!isPlainObject(continuation.assurance)) {
    return {
      ok: false,
      error_code: 'gate_failed',
      reason: 'Confirmation assurance record is required',
    };
  }
  const assurance = continuation.assurance;
  const unexpectedAssurance = hasUnexpectedObjectKeys(
    assurance,
    CONFIRMATION_ASSURANCE_KEYS,
  );
  if (unexpectedAssurance !== null) {
    return {
      ok: false,
      error_code: 'gate_failed',
      reason: `MemoryConfirmationAssuranceV1 has unexpected key '${unexpectedAssurance}'`,
    };
  }

  if (
    assurance.enrolled_oidc_domain !== 'sent-tech.ca' ||
    assurance.hardware_key_required !== false ||
    assurance.identity_source !== 'enrolled_oidc_2fa'
  ) {
    return {
      ok: false,
      error_code: 'gate_failed',
      reason:
        "Confirmation assurance must use enrolled OIDC/2FA on 'sent-tech.ca' with hardware_key_required: false",
    };
  }

  // Four separate literal-true checks (authentication, active enrollment, current step-up assurance, approval)
  if (assurance.authenticated !== true) {
    return {
      ok: false,
      error_code: 'gate_failed',
      reason: 'Confirming human authentication verdict must be literal true',
    };
  }
  if (assurance.enrolled_2fa !== true) {
    return {
      ok: false,
      error_code: 'gate_failed',
      reason: 'Confirming human active 2FA enrollment verdict must be literal true',
    };
  }
  if (assurance.step_up_assurance_verified !== true) {
    return {
      ok: false,
      error_code: 'gate_failed',
      reason: 'Confirming human step-up 2FA assurance verdict must be literal true',
    };
  }

  if (
    !isValidOpaqueRef(assurance.issuer) ||
    !isValidOpaqueRef(assurance.approving_subject_sub) ||
    !isValidOpaqueRef(assurance.approving_human_principal_id) ||
    !isValidSha256Digest(assurance.enrollment_receipt_digest) ||
    !isValidSha256Digest(assurance.step_up_2fa_receipt_digest) ||
    !isValidOpaqueRef(assurance.assurance_policy_version)
  ) {
    return {
      ok: false,
      error_code: 'gate_failed',
      reason: 'Confirmation assurance issuer, subject, receipts, or policy version invalid',
    };
  }

  if (!isValidOpaqueRef(expected.expected_issuer) || assurance.issuer !== expected.expected_issuer ||
      !isValidOpaqueRef(expected.approving_human_principal_id) ||
      assurance.approving_human_principal_id !== expected.approving_human_principal_id ||
      !isValidOpaqueRef(expected.approving_subject_sub) || assurance.approving_subject_sub !== expected.approving_subject_sub ||
      !Array.isArray(expected.accepted_assurance_policy_versions) ||
      !expected.accepted_assurance_policy_versions.every(v => isValidOpaqueRef(v)) ||
      !expected.accepted_assurance_policy_versions.includes(assurance.assurance_policy_version)) {
    return { ok: false, error_code: 'gate_failed', reason: 'Approving identity, issuer or assurance policy is not accepted by current host configuration' };
  }

  if (assurance.delegation !== undefined) {
    if (!isPlainObject(assurance.delegation) ||
        assurance.delegation.delegator_principal_id !== expected.initiating_principal_id ||
        assurance.delegation.delegate_principal_id !== assurance.approving_human_principal_id) {
      return { ok: false, error_code: 'gate_failed', reason: 'Delegation must bind the initiating and approving principals' };
    }
    const delCheck = checkDelegationBinding(
      assurance.delegation,
      expected.now,
    );
    if (!delCheck.ok) {
      return {
        ok: false,
        error_code: 'gate_failed',
        reason: delCheck.reason,
      };
    }
  } else if (
    assurance.approving_human_principal_id !== expected.initiating_principal_id
  ) {
    return {
      ok: false,
      error_code: 'gate_failed',
      reason:
        'Approving human differs from initiating principal without host-verified delegation',
    };
  }

  // Logical session & transport attachment reattachment verification
  if (continuation.logical_session_ref !== expected.logical_session_ref) {
    return {
      ok: false,
      error_code: 'gate_failed',
      reason:
        'New logical session requires a fresh operation-bound confirmation before any uncommitted effect',
    };
  }

  if (continuation.active_generation !== expected.active_generation) {
    return {
      ok: false,
      error_code: 'gate_failed',
      reason: 'Confirmation continuation active_generation is stale',
    };
  }

  if (continuation.reattachment_proof !== undefined || continuation.transport_attachment_ref !== expected.transport_attachment_ref) {
    if (!isPlainObject(continuation.reattachment_proof)) {
      return {
        ok: false,
        error_code: 'gate_failed',
        reason:
          'Transport attachment changed without durable host reattachment proof',
      };
    }
    const proof = continuation.reattachment_proof;
    if (
      !hasExactKeys(proof, ['previous_attachment_ref', 'current_attachment_ref', 'reattachment_receipt_digest', 'verified', 'admitted_generation']) ||
      proof.verified !== true ||
      proof.previous_attachment_ref !== continuation.transport_attachment_ref ||
      proof.current_attachment_ref !== expected.transport_attachment_ref ||
      proof.admitted_generation !== expected.active_generation ||
      !isValidSha256Digest(proof.reattachment_receipt_digest)
    ) {
      return {
        ok: false,
        error_code: 'gate_failed',
        reason: 'Logical-session reattachment proof is invalid or unverified',
      };
    }
  }

  // Freshness, 300s TTL ceiling, and 30s post-confirmation execution bound
  const issuedMs = parseInstantMs(continuation.issued_at);
  const expiresMs = parseInstantMs(continuation.expires_at);
  const nowMs = parseInstantMs(expected.now);
  const execDeadlineMs = parseInstantMs(expected.execution_deadline_at);

  if (
    issuedMs === null ||
    expiresMs === null ||
    nowMs === null ||
    execDeadlineMs === null
  ) {
    return {
      ok: false,
      error_code: 'gate_failed',
      reason: 'Confirmation continuation timestamps must be valid UTC instants',
    };
  }

  if (expiresMs <= issuedMs) {
    return {
      ok: false,
      error_code: 'gate_failed',
      reason: 'expires_at must be strictly greater than issued_at',
    };
  }

  if (
    expiresMs - issuedMs >
    MEMORY_MCP_LIMITS.CONFIRMATION_MAX_TTL_SECONDS * 1000
  ) {
    return {
      ok: false,
      error_code: 'gate_failed',
      reason: 'Confirmation TTL exceeds 300 seconds maximum',
    };
  }

  if (nowMs < issuedMs || (expected.reservation_state !== 'committed' && nowMs >= expiresMs)) {
    return {
      ok: false,
      error_code: 'gate_failed',
      reason: 'Confirmation requires issued_at <= now < expires_at at the effect guard',
    };
  }

  // M4:567 relaxes expiry only after durable commitment; approval, assurance,
  // active binding and the original <= 300s validity interval remain mandatory.
  if (expected.reservation_state === 'committed') {
    return {
      ok: true,
      decision: 'disclose_committed_without_repeat_effect',
      continuation: continuation as unknown as MemoryConfirmationContinuationV1,
    };
  }

  if (
    execDeadlineMs < nowMs ||
    execDeadlineMs - nowMs > MEMORY_MCP_LIMITS.MAX_INVOCATION_DEADLINE_MS ||
    execDeadlineMs > expiresMs
  ) {
    return {
      ok: false,
      error_code: 'gate_failed',
      reason:
        'Execution after confirmation must be bounded to at most 30 seconds and not exceed confirmation expiry',
    };
  }

  return {
    ok: true,
    decision: 'execute_confirmed',
    continuation: continuation as unknown as MemoryConfirmationContinuationV1,
  };
}
