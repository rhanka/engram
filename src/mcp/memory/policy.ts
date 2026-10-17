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

import {
  ENGRAM_MEMORY_MCP_CONTRACT_VERSION,
  MEMORY_MCP_LIMITS,
  type AuthorizationContextV1,
  type CaptureOutputV1,
  type Cursor,
  type Digest,
  type EngramMemoryToolName,
  type ForgetOutputV1,
  type IdempotencyKey,
  type Instant,
  type LifecycleEventAnchorV1,
  type OpaqueRef,
  type PublicMemoryErrorCode,
  type ReconciliationConsentV1,
  type RequestAdmissionOutputV1,
  type RetentionV1,
  type WithdrawOutputV1,
} from './contracts.js';
import {
  isValidCursor,
  isValidIdempotencyKey,
  isValidInstant,
  isValidOpaqueRef,
  isValidSha256Digest,
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
export interface DestructiveConfirmationGrantV1 {
  readonly elicitation_ref: OpaqueRef;
  readonly capability: 'engram_memory_withdraw' | 'engram_memory_forget';
  readonly mcp_client_id: OpaqueRef;
  readonly session_id: OpaqueRef;
  readonly principal_id: OpaqueRef;
  readonly tenant_id: OpaqueRef;
  readonly scope_ref: OpaqueRef;
  readonly target_ref: OpaqueRef;
  readonly operation_digest: Digest;
  readonly issued_at: Instant;
  readonly expires_at: Instant;
  readonly state: 'pending' | 'validated_resumed' | 'expired' | 'declined';
  readonly request: {
    readonly capability: 'engram_memory_withdraw' | 'engram_memory_forget';
    readonly target_ref: OpaqueRef;
    readonly operation_digest: Digest;
  };
  readonly response?: {
    readonly approved: boolean;
  };
}

export interface ExpectedDestructiveConfirmationV1 {
  readonly capability: 'engram_memory_withdraw' | 'engram_memory_forget';
  readonly mcp_client_id: OpaqueRef;
  readonly session_id: OpaqueRef;
  readonly principal_id: OpaqueRef;
  readonly tenant_id: OpaqueRef;
  readonly scope_ref: OpaqueRef;
  readonly target_ref: OpaqueRef;
  readonly operation_digest: Digest;
  readonly now_utc: Instant;
}

/**
 * Verifies a host-validated, resumed MCP elicitation confirmation grant for
 * `engram_memory_withdraw` or `engram_memory_forget` per M4 and M7.
 */
export function verifyDestructiveConfirmationGrantV1(
  grant: DestructiveConfirmationGrantV1 | undefined | null,
  expected: ExpectedDestructiveConfirmationV1,
): PolicyValidationResult<DestructiveConfirmationGrantV1> {
  if (!grant || !isPlainObject(grant as unknown)) {
    return {
      ok: false,
      error_code: 'gate_failed',
      message:
        'Destructive memory operation requires a validated host elicitation confirmation.',
    };
  }

  if (grant.state !== 'validated_resumed') {
    return {
      ok: false,
      error_code: 'gate_failed',
      message: "Elicitation confirmation state must be 'validated_resumed'.",
    };
  }

  if (
    !isPlainObject(grant.request) ||
    Object.keys(grant.request).some(
      (k) =>
        k !== 'capability' && k !== 'target_ref' && k !== 'operation_digest',
    )
  ) {
    return {
      ok: false,
      error_code: 'gate_failed',
      message:
        'Elicitation request must be a closed { capability, target_ref, operation_digest } object with no secret-bearing fields.',
    };
  }

  if (
    !isPlainObject(grant.response) ||
    Object.keys(grant.response).length !== 1 ||
    grant.response.approved !== true
  ) {
    return {
      ok: false,
      error_code: 'gate_failed',
      message:
        'Elicitation response must be a closed { approved: true } object.',
    };
  }

  if (
    !isValidOpaqueRef(grant.elicitation_ref) ||
    !isValidOpaqueRef(grant.mcp_client_id) ||
    !isValidOpaqueRef(grant.session_id) ||
    !isValidOpaqueRef(grant.principal_id) ||
    !isValidOpaqueRef(grant.tenant_id) ||
    !isValidOpaqueRef(grant.scope_ref) ||
    !isValidOpaqueRef(grant.target_ref) ||
    !isValidSha256Digest(grant.operation_digest) ||
    !isValidSha256Digest(expected.operation_digest)
  ) {
    return {
      ok: false,
      error_code: 'gate_failed',
      message: 'Elicitation confirmation contains malformed binding fields.',
    };
  }

  if (
    !isValidInstant(grant.issued_at) ||
    !isValidInstant(grant.expires_at) ||
    !isValidInstant(expected.now_utc)
  ) {
    return {
      ok: false,
      error_code: 'gate_failed',
      message: 'Elicitation confirmation contains an invalid timestamp.',
    };
  }

  const issuedMs = Date.parse(grant.issued_at);
  const expiresMs = Date.parse(grant.expires_at);
  const nowMs = Date.parse(expected.now_utc);
  const maxTtlMs = MEMORY_MCP_LIMITS.CONFIRMATION_MAX_TTL_SECONDS * 1000;

  if (
    expiresMs <= issuedMs ||
    expiresMs - issuedMs > maxTtlMs ||
    nowMs < issuedMs ||
    nowMs > expiresMs
  ) {
    return {
      ok: false,
      error_code: 'gate_failed',
      message:
        'Elicitation confirmation has expired or exceeds the 300s TTL ceiling.',
    };
  }

  if (
    grant.capability !== expected.capability ||
    grant.request.capability !== expected.capability ||
    grant.request.target_ref !== expected.target_ref ||
    grant.request.operation_digest !== expected.operation_digest ||
    grant.mcp_client_id !== expected.mcp_client_id ||
    grant.session_id !== expected.session_id ||
    grant.principal_id !== expected.principal_id ||
    grant.tenant_id !== expected.tenant_id ||
    grant.scope_ref !== expected.scope_ref ||
    grant.target_ref !== expected.target_ref ||
    grant.operation_digest !== expected.operation_digest
  ) {
    return {
      ok: false,
      error_code: 'gate_failed',
      message:
        'Elicitation confirmation binding does not match the caller, client, session, target, or operation_digest.',
    };
  }

  return { ok: true, value: grant };
}

/**
 * M5 Durable Idempotent Operation Reservation Key & Record.
 */
export type MutatingMemoryToolName =
  | 'engram_memory_capture'
  | 'engram_memory_request_admission'
  | 'engram_memory_withdraw'
  | 'engram_memory_forget';

export interface DurableOperationKeyV1 {
  readonly principal_namespace: OpaqueRef;
  readonly tenant_id: OpaqueRef;
  readonly store_id: OpaqueRef;
  readonly connector_id: 'engram-memory';
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
  readonly candidate_id?: OpaqueRef;
  readonly source_order?: CaptureSourceOrderV1;
  readonly effective_retention?: RetentionV1;
  readonly effective_reconciliation?: ReconciliationConsentV1;
  readonly event_id?: OpaqueRef;
  readonly event_anchor?: LifecycleEventAnchorV1;
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
      readonly existing_record: DurableOperationRecordV1<TOutput>;
    }
  | {
      readonly decision: 'reject';
      readonly error_code:
        | 'DIGEST_CONFLICT'
        | 'UNAUTHORIZED'
        | 'NOT_FOUND'
        | 'FENCE_LOST'
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

/**
 * Evaluates durable idempotent reservation state per M5:
 * - Every call (including replay) MUST pass current caller authorization first.
 * - On target-bearing tools (`request_admission`, `withdraw`, `forget`), if
 *   target-scope authorization has not succeeded (`targetAuthorized === false`),
 *   returns `NOT_FOUND` (never leaking `DIGEST_CONFLICT`).
 * - Conflicting `normalized_input_digest` or `target_ref` under the same
 *   reservation scope and `idempotency_key` fails closed with `DIGEST_CONFLICT`.
 * - Incomplete `failed_retryable` reservations resume with the frozen
 *   `candidate_id`, `source_order`, `effective_retention`,
 *   `effective_reconciliation`, `event_id`, and `event_anchor`.
 */
export function evaluateIdempotentMutationStateV1<TOutput>(
  existing: DurableOperationRecordV1<TOutput> | undefined,
  incoming: {
    readonly key: DurableOperationKeyV1;
    readonly normalized_input_digest: Digest;
    readonly callerAuthorized?: boolean;
    readonly targetAuthorized?: boolean;
  },
): IdempotentMutationDecisionV1<TOutput> {
  const isTargetTool = incoming.key.tool_name !== 'engram_memory_capture';

  if (incoming.targetAuthorized === false && isTargetTool) {
    return {
      decision: 'reject',
      error_code: 'NOT_FOUND',
      retriable: false,
    };
  }

  if (incoming.callerAuthorized === false) {
    return {
      decision: 'reject',
      error_code: isTargetTool ? 'NOT_FOUND' : 'UNAUTHORIZED',
      retriable: false,
    };
  }

  if (
    !isValidIdempotencyKey(incoming.key.idempotency_key) ||
    !isValidSha256Digest(incoming.normalized_input_digest)
  ) {
    return {
      decision: 'reject',
      error_code: 'INVALID_SCHEMA',
      retriable: false,
    };
  }

  if (!existing) {
    return { decision: 'execute_new' };
  }

  if (
    existing.key.principal_namespace !== incoming.key.principal_namespace ||
    existing.key.tenant_id !== incoming.key.tenant_id ||
    existing.key.store_id !== incoming.key.store_id ||
    existing.key.connector_id !== incoming.key.connector_id ||
    existing.key.scope_ref !== incoming.key.scope_ref ||
    existing.key.tool_name !== incoming.key.tool_name ||
    existing.key.tool_contract_version !== incoming.key.tool_contract_version ||
    existing.key.idempotency_key !== incoming.key.idempotency_key ||
    existing.key.target_ref !== incoming.key.target_ref ||
    existing.normalized_input_digest !== incoming.normalized_input_digest
  ) {
    return {
      decision: 'reject',
      error_code: 'DIGEST_CONFLICT',
      retriable: false,
    };
  }

  if (existing.status === 'in_flight') {
    return {
      decision: 'reject',
      error_code: 'FENCE_LOST',
      retriable: true,
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
      error_code: 'FENCE_LOST',
      retriable: true,
    };
  }

  return {
    decision: 'replay_completed',
    output: applyReplayedOutputMarker(
      incoming.key.tool_name,
      existing.stored_output,
    ),
  };
}

/**
 * M2 / M5 Same-Scope Tombstone Recapture Guard:
 * Recapturing identical canonical content in the same scope after a tombstone
 * MUST be refused by host policy (`ILLEGAL_TRANSITION` / `UNAUTHORIZED`);
 * tombstones are irreversible through the agent MCP surface.
 */
export function evaluateSameScopeTombstoneRecaptureGuardV1(input: {
  readonly scope_ref: OpaqueRef;
  readonly candidate_payload_digest: Digest;
  readonly tombstoned_payload_digests_in_scope: ReadonlySet<Digest> | readonly Digest[];
}): PolicyValidationResult<{ readonly allowed: true }> {
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

  const tombstonedSet =
    input.tombstoned_payload_digests_in_scope instanceof Set
      ? input.tombstoned_payload_digests_in_scope
      : new Set(input.tombstoned_payload_digests_in_scope);

  if (tombstonedSet.has(input.candidate_payload_digest)) {
    return {
      ok: false,
      error_code: 'ILLEGAL_TRANSITION',
      message:
        'Recapturing tombstoned content in the same scope is refused; tombstones are irreversible on the agent MCP surface.',
    };
  }

  return {
    ok: true,
    value: { allowed: true },
  };
}
