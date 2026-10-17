/**
 * MCP-L0 Host Policy, Trusted Provenance, Destructive Confirmation, and
 * Durable Idempotent Operation Identity Contracts.
 */

import {
  ENGRAM_MEMORY_SCHEMA_VERSION,
  MEMORY_MCP_LIMITS,
  type CaptureInputV1,
  type CaptureReconciliationHintV1,
  type CaptureRetentionHintV1,
  type EngramMemoryToolName,
  type IsoUtcTimestamp,
  type LifecycleEventAnchorV1,
  type MemoryRetentionV1,
  type OpaqueId,
  type PrincipalRefV1,
  type PublicMemoryErrorCode,
  type ReasonCode,
  type ReconciliationHookV1,
  type RetentionOutcome,
  type ScopeRefV1,
  type Sha256Digest,
} from './contracts.js';
import {
  isValidIsoUtcTimestamp,
  validatePrincipalRefV1,
  validateScopeRefV1,
} from './schemas.js';

export interface TrustedInvocationContextV1 {
  readonly scope_ref: ScopeRefV1;
  readonly principal_ref: PrincipalRefV1;
  readonly correlation_id: OpaqueId;
  readonly now_utc: IsoUtcTimestamp;
  readonly deadline_ms: number;
  readonly capability_token_id: OpaqueId;
}

export type PolicyValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly error_code: PublicMemoryErrorCode;
      readonly message: string;
    };

/**
 * Validates that the host/broker supplied a non-fabricated trusted invocation
 * context with aligned tenant IDs and a bounded deadline (`<= 30,000 ms`).
 */
export function validateTrustedInvocationContextV1(
  ctx: unknown,
): PolicyValidationResult<TrustedInvocationContextV1> {
  if (typeof ctx !== 'object' || ctx === null) {
    return {
      ok: false,
      error_code: 'SCOPE_VIOLATION',
      message: 'Missing trusted invocation context.',
    };
  }
  const candidate = ctx as Record<string, unknown>;
  const scopeRes = validateScopeRefV1(candidate.scope_ref, 'scope_ref');
  if (!scopeRes.ok) {
    return {
      ok: false,
      error_code: 'SCOPE_VIOLATION',
      message: 'Missing or invalid trusted ScopeRefV1.',
    };
  }
  const prinRes = validatePrincipalRefV1(
    candidate.principal_ref,
    'principal_ref',
  );
  if (!prinRes.ok) {
    return {
      ok: false,
      error_code: 'UNAUTHORIZED_PRINCIPAL',
      message: 'Missing or invalid trusted PrincipalRefV1.',
    };
  }

  if (scopeRes.value.tenant_id !== prinRes.value.tenant_id) {
    return {
      ok: false,
      error_code: 'SCOPE_VIOLATION',
      message: 'Trusted principal tenant_id does not match trusted scope_ref.',
    };
  }

  if (
    typeof candidate.correlation_id !== 'string' ||
    candidate.correlation_id.length < 1 ||
    candidate.correlation_id.length > 128
  ) {
    return {
      ok: false,
      error_code: 'INVALID_SCHEMA',
      message: 'Trusted correlation_id is required.',
    };
  }

  if (!isValidIsoUtcTimestamp(candidate.now_utc)) {
    return {
      ok: false,
      error_code: 'INVALID_TIMESTAMP',
      message: 'Trusted now_utc must be a valid ISO-8601 UTC timestamp.',
    };
  }

  if (
    typeof candidate.deadline_ms !== 'number' ||
    !Number.isInteger(candidate.deadline_ms) ||
    candidate.deadline_ms <= 0 ||
    candidate.deadline_ms > MEMORY_MCP_LIMITS.MAX_INVOCATION_DEADLINE_MS
  ) {
    return {
      ok: false,
      error_code: 'INVALID_SCHEMA',
      message: `Invocation deadline_ms must be 1..${MEMORY_MCP_LIMITS.MAX_INVOCATION_DEADLINE_MS}.`,
    };
  }

  if (
    typeof candidate.capability_token_id !== 'string' ||
    candidate.capability_token_id.length < 1 ||
    candidate.capability_token_id.length > 128
  ) {
    return {
      ok: false,
      error_code: 'gate_failed',
      message: 'Trusted capability_token_id is required.',
    };
  }

  return {
    ok: true,
    value: candidate as unknown as TrustedInvocationContextV1,
  };
}

/**
 * Verifies that `capture.provenance.captured_by` matches the authenticated
 * caller `principal_ref` (preventing provenance spoofing).
 */
export function validateCaptureProvenancePrincipalBindingV1(
  input: Pick<CaptureInputV1, 'provenance'>,
  trustedPrincipal: PrincipalRefV1,
): PolicyValidationResult<PrincipalRefV1> {
  const capturedBy = input.provenance.captured_by;
  if (
    capturedBy.principal_id !== trustedPrincipal.principal_id ||
    capturedBy.tenant_id !== trustedPrincipal.tenant_id ||
    capturedBy.principal_kind !== trustedPrincipal.principal_kind
  ) {
    return {
      ok: false,
      error_code: 'UNAUTHORIZED_PRINCIPAL',
      message:
        'provenance.captured_by must match the authenticated caller principal.',
    };
  }
  return { ok: true, value: trustedPrincipal };
}

const MUTATION_TOOL_TO_ANCHOR_KIND: Readonly<
  Record<
    | 'engram_memory_capture'
    | 'engram_memory_request_admission'
    | 'engram_memory_withdraw'
    | 'engram_memory_forget',
    LifecycleEventAnchorV1['anchor_kind']
  >
> = {
  engram_memory_capture: 'capture',
  engram_memory_request_admission: 'admission',
  engram_memory_withdraw: 'withdrawal',
  engram_memory_forget: 'erasure',
} as const;

/**
 * Constructs a host-verified `LifecycleEventAnchorV1` for a mutating tool call.
 * Callers never supply `event_anchor` in tool input JSON.
 */
export function createHostLifecycleEventAnchorV1(input: {
  readonly tool:
    | 'engram_memory_capture'
    | 'engram_memory_request_admission'
    | 'engram_memory_withdraw'
    | 'engram_memory_forget';
  readonly event_anchor_id: OpaqueId;
  readonly context: TrustedInvocationContextV1;
  readonly causation_event_id?: OpaqueId;
}): LifecycleEventAnchorV1 {
  const base: LifecycleEventAnchorV1 = {
    schema_version: ENGRAM_MEMORY_SCHEMA_VERSION,
    event_anchor_id: input.event_anchor_id,
    anchor_kind: MUTATION_TOOL_TO_ANCHOR_KIND[input.tool],
    occurred_at_utc: input.context.now_utc,
    actor: input.context.principal_ref,
    correlation_id: input.context.correlation_id,
  };
  if (input.causation_event_id !== undefined) {
    return {
      ...base,
      causation_event_id: input.causation_event_id,
    };
  }
  return base;
}

export interface HostRetentionPolicyConfigV1 {
  readonly policy_id: OpaqueId;
  readonly default_retention_days: number;
  readonly max_retention_days: number;
  readonly default_expiry_outcome: 'make-ineligible' | 'tombstone';
  readonly allow_retain_outcome: boolean;
  readonly review_Lead_days?: number;
}

const MS_PER_DAY = 86_400_000;

/**
 * Resolves the effective `MemoryRetentionV1` for `engram_memory_capture`:
 * - Default `expiry_outcome` is `'make-ineligible'` (or host-configured `'tombstone'`).
 * - `'retain'` is disallowed unless `hostPolicy.allow_retain_outcome === true`;
 *   otherwise a `'retain'` hint is clamped to `hostPolicy.default_expiry_outcome`.
 * - `retain_until_utc` is always finite and clamped to `max_retention_days`
 *   (<= 365 days).
 * - `legal_hold` is always initialized to `false` on agent capture.
 * - On idempotent retry (`persistedRetention`), the previously persisted
 *   `MemoryRetentionV1` is returned unchanged.
 */
export function resolveCaptureRetentionPolicyV1(input: {
  readonly captured_at_utc: IsoUtcTimestamp;
  readonly host_policy: HostRetentionPolicyConfigV1;
  readonly retention_hint?: CaptureRetentionHintV1;
  readonly persisted_retention?: MemoryRetentionV1;
}): PolicyValidationResult<MemoryRetentionV1> {
  if (input.persisted_retention) {
    return { ok: true, value: input.persisted_retention };
  }

  if (!isValidIsoUtcTimestamp(input.captured_at_utc)) {
    return {
      ok: false,
      error_code: 'INVALID_TIMESTAMP',
      message: 'captured_at_utc must be a valid ISO-8601 UTC timestamp.',
    };
  }

  const capturedMs = Date.parse(input.captured_at_utc);
  const maxDays = Math.min(
    Math.max(1, input.host_policy.max_retention_days),
    MEMORY_MCP_LIMITS.MAX_RETENTION_CEILING_DAYS,
  );
  const defaultDays = Math.min(
    Math.max(1, input.host_policy.default_retention_days),
    maxDays,
  );

  const ceilingMs = capturedMs + maxDays * MS_PER_DAY;
  let effectiveRetainUntilMs = capturedMs + defaultDays * MS_PER_DAY;

  if (input.retention_hint?.expires_at_utc !== undefined) {
    if (!isValidIsoUtcTimestamp(input.retention_hint.expires_at_utc)) {
      return {
        ok: false,
        error_code: 'INVALID_TIMESTAMP',
        message: 'retention_hint.expires_at_utc is invalid.',
      };
    }
    const hintMs = Date.parse(input.retention_hint.expires_at_utc);
    if (hintMs <= capturedMs) {
      return {
        ok: false,
        error_code: 'INVALID_TIMESTAMP',
        message:
          'retention_hint.expires_at_utc must be strictly after captured_at_utc.',
      };
    }
    effectiveRetainUntilMs = Math.min(hintMs, ceilingMs);
  }

  let effectiveOutcome: RetentionOutcome =
    input.host_policy.default_expiry_outcome;
  if (input.retention_hint?.expiry_outcome !== undefined) {
    if (input.retention_hint.expiry_outcome === 'retain') {
      effectiveOutcome = input.host_policy.allow_retain_outcome
        ? 'retain'
        : input.host_policy.default_expiry_outcome;
    } else {
      effectiveOutcome = input.retention_hint.expiry_outcome;
    }
  }

  const retainUntilUtc = new Date(effectiveRetainUntilMs).toISOString();
  const reviewAfterUtc = new Date(
    Math.max(
      capturedMs,
      effectiveRetainUntilMs -
        (input.host_policy.review_Lead_days ?? 7) * MS_PER_DAY,
    ),
  ).toISOString();

  return {
    ok: true,
    value: {
      schema_version: ENGRAM_MEMORY_SCHEMA_VERSION,
      policy_id: input.host_policy.policy_id,
      retain_until_utc: retainUntilUtc,
      review_after_utc: reviewAfterUtc,
      expiry_outcome: effectiveOutcome,
      legal_hold: false,
    },
  };
}

export interface HostReconciliationPolicyConfigV1 {
  readonly default_strategy:
    | 'manual-only'
    | 'supersede-by-key'
    | 'append-distinct';
  readonly derived_conflict_key?: string;
  readonly consented_family_refs: readonly OpaqueId[];
}

/**
 * Resolves the effective `ReconciliationHookV1` for `engram_memory_capture`:
 * - Caller `reconciliation_hint.family_refs` must be a subset of
 *   `host_policy.consented_family_refs`; any unauthorized ref fails with
 *   `CONSENT_DENIED`.
 * - On idempotent retry (`persisted_reconciliation`), the previously persisted
 *   hook is reused unchanged.
 */
export function resolveCaptureReconciliationHookV1(input: {
  readonly host_policy: HostReconciliationPolicyConfigV1;
  readonly reconciliation_hint?: CaptureReconciliationHintV1;
  readonly persisted_reconciliation?: ReconciliationHookV1;
}): PolicyValidationResult<ReconciliationHookV1> {
  if (input.persisted_reconciliation) {
    return { ok: true, value: input.persisted_reconciliation };
  }

  const consented = new Set(input.host_policy.consented_family_refs);
  const requestedRefs = input.reconciliation_hint?.family_refs ?? [];

  for (const ref of requestedRefs) {
    if (!consented.has(ref)) {
      return {
        ok: false,
        error_code: 'CONSENT_DENIED',
        message: `reconciliation_hint family_ref '${ref}' is not authorized by active consent.`,
      };
    }
  }

  const base: ReconciliationHookV1 = {
    schema_version: ENGRAM_MEMORY_SCHEMA_VERSION,
    strategy: input.host_policy.default_strategy,
    family_refs:
      requestedRefs.length > 0
        ? [...requestedRefs]
        : [...input.host_policy.consented_family_refs],
  };

  if (input.host_policy.derived_conflict_key !== undefined) {
    return {
      ok: true,
      value: {
        ...base,
        conflict_key: input.host_policy.derived_conflict_key,
      },
    };
  }

  return { ok: true, value: base };
}

export interface DestructiveConfirmationGrantV1 {
  readonly confirmation_id: OpaqueId;
  readonly tool_name: 'engram_memory_withdraw' | 'engram_memory_forget';
  readonly scope_ref: ScopeRefV1;
  readonly principal_id: OpaqueId;
  readonly memory_id: OpaqueId;
  readonly reason_code: ReasonCode;
  readonly target_digest_or_status: string;
  readonly issued_at_utc: IsoUtcTimestamp;
  readonly expires_at_utc: IsoUtcTimestamp;
}

/**
 * Verifies an out-of-band MCP elicitation or host confirmation token for
 * `engram_memory_withdraw` or `engram_memory_forget`.
 */
export function verifyDestructiveConfirmationGrantV1(
  grant: DestructiveConfirmationGrantV1 | undefined,
  expected: {
    readonly tool_name: 'engram_memory_withdraw' | 'engram_memory_forget';
    readonly scope_ref: ScopeRefV1;
    readonly principal_id: OpaqueId;
    readonly memory_id: OpaqueId;
    readonly reason_code: ReasonCode;
    readonly target_digest_or_status: string;
    readonly now_utc: IsoUtcTimestamp;
  },
): PolicyValidationResult<DestructiveConfirmationGrantV1> {
  if (!grant) {
    return {
      ok: false,
      error_code: 'gate_failed',
      message:
        'Destructive memory operation requires an out-of-band confirmation grant.',
    };
  }

  if (
    !isValidIsoUtcTimestamp(grant.issued_at_utc) ||
    !isValidIsoUtcTimestamp(grant.expires_at_utc) ||
    !isValidIsoUtcTimestamp(expected.now_utc)
  ) {
    return {
      ok: false,
      error_code: 'gate_failed',
      message: 'Confirmation grant contains an invalid timestamp.',
    };
  }

  const issuedMs = Date.parse(grant.issued_at_utc);
  const expiresMs = Date.parse(grant.expires_at_utc);
  const nowMs = Date.parse(expected.now_utc);
  const maxTtlMs = MEMORY_MCP_LIMITS.CONFIRMATION_TOKEN_TTL_SECONDS * 1000;

  if (
    expiresMs <= issuedMs ||
    expiresMs - issuedMs > maxTtlMs ||
    nowMs < issuedMs ||
    nowMs > expiresMs
  ) {
    return {
      ok: false,
      error_code: 'gate_failed',
      message: 'Confirmation grant has expired or exceeds the 300s TTL ceiling.',
    };
  }

  if (
    grant.tool_name !== expected.tool_name ||
    JSON.stringify(grant.scope_ref) !== JSON.stringify(expected.scope_ref) ||
    grant.principal_id !== expected.principal_id ||
    grant.memory_id !== expected.memory_id ||
    grant.reason_code !== expected.reason_code ||
    grant.target_digest_or_status !== expected.target_digest_or_status
  ) {
    return {
      ok: false,
      error_code: 'gate_failed',
      message:
        'Confirmation grant binding does not match target record or caller parameters.',
    };
  }

  return { ok: true, value: grant };
}

export interface DurableOperationKeyV1 {
  readonly scope_ref: ScopeRefV1;
  readonly principal_id: OpaqueId;
  readonly tool_name:
    | 'engram_memory_capture'
    | 'engram_memory_request_admission'
    | 'engram_memory_withdraw'
    | 'engram_memory_forget';
  readonly idempotency_key: string;
}

export interface DurableOperationRecordV1<TOutput = unknown> {
  readonly key: DurableOperationKeyV1;
  readonly request_digest: Sha256Digest;
  readonly status: 'in_flight' | 'completed' | 'failed_retryable';
  readonly created_at_utc: IsoUtcTimestamp;
  readonly effective_retention?: MemoryRetentionV1;
  readonly effective_reconciliation?: ReconciliationHookV1;
  readonly stored_output?: TOutput;
}

export type IdempotentMutationDecisionV1<TOutput> =
  | { readonly decision: 'execute_new' }
  | {
      readonly decision: 'replay_completed';
      readonly output: TOutput & { readonly idempotent_replay: true };
    }
  | {
      readonly decision: 'resume_incomplete';
      readonly existing_record: DurableOperationRecordV1<TOutput>;
    }
  | {
      readonly decision: 'reject';
      readonly error_code: 'IDEMPOTENCY_CONFLICT' | 'CONCURRENCY_CONFLICT';
      readonly retryable: boolean;
    };

/**
 * Evaluates durable operation state for `(scope_ref, principal_id, tool_name, idempotency_key)`
 * per §6.3, §6.4, §6.5, and §6.6.
 */
export function evaluateIdempotentMutationStateV1<
  TOutput extends { readonly idempotent_replay: boolean },
>(
  existing: DurableOperationRecordV1<TOutput> | undefined,
  incomingRequestDigest: Sha256Digest,
): IdempotentMutationDecisionV1<TOutput> {
  if (!existing) {
    return { decision: 'execute_new' };
  }

  if (existing.request_digest !== incomingRequestDigest) {
    return {
      decision: 'reject',
      error_code: 'IDEMPOTENCY_CONFLICT',
      retryable: false,
    };
  }

  if (existing.status === 'in_flight') {
    return {
      decision: 'reject',
      error_code: 'CONCURRENCY_CONFLICT',
      retryable: true,
    };
  }

  if (existing.status === 'failed_retryable') {
    return {
      decision: 'resume_incomplete',
      existing_record: existing,
    };
  }

  if (!existing.stored_output) {
    return {
      decision: 'reject',
      error_code: 'CONCURRENCY_CONFLICT',
      retryable: true,
    };
  }

  return {
    decision: 'replay_completed',
    output: {
      ...existing.stored_output,
      idempotent_replay: true,
    },
  };
}
