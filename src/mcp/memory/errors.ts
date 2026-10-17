/**
 * MCP-L0 Total Error Mapping Table & Disclosure-Safe Normalization Contract.
 *
 * Maps all 27 neutral `MemoryErrorCode` values plus the 4 public MCP/Sentropic
 * transport/broker codes (`RESULT_TOO_LARGE`, `RATE_LIMITED`,
 * `MUTATION_OUTCOME_UNKNOWN`, `gate_failed`) to deterministic public failure
 * envelopes (`ToolFailureV1`) with `isError: true`.
 */

import {
  ENGRAM_MEMORY_SCHEMA_VERSION,
  type EngramMemoryToolName,
  type McpToolCallResponseV1,
  type PublicMemoryErrorCode,
  type ToolFailureV1,
} from './contracts.js';

export const NEUTRAL_MEMORY_ERROR_CODES = [
  'INVALID_SCHEMA',
  'UNSUPPORTED_SCHEMA_VERSION',
  'INVALID_TIMESTAMP',
  'INVALID_DIGEST',
  'SCOPE_VIOLATION',
  'UNAUTHORIZED_PRINCIPAL',
  'CONSENT_DENIED',
  'CONSENT_REVOKED',
  'SHARING_POLICY_DENIED',
  'QUOTA_EXCEEDED',
  'NOT_FOUND',
  'DUPLICATE_ID',
  'IDEMPOTENCY_CONFLICT',
  'CONCURRENCY_CONFLICT',
  'ILLEGAL_TRANSITION',
  'ALREADY_TERMINAL',
  'LEGAL_HOLD_ACTIVE',
  'EVIDENCE_UNVERIFIED',
  'EVIDENCE_DIGEST_MISMATCH',
  'ADMISSION_REJECTED',
  'QUARANTINED',
  'HASH_CHAIN_BROKEN',
  'SIGNATURE_INVALID',
  'BUNDLE_INTEGRITY_FAILED',
  'ERASURE_INCOMPLETE',
  'DEPENDENCY_UNAVAILABLE',
  'STORAGE_IO_ERROR',
] as const;

export type NeutralMemoryErrorCode =
  (typeof NEUTRAL_MEMORY_ERROR_CODES)[number];

export const ADDITIONAL_PUBLIC_MEMORY_ERROR_CODES = [
  'RESULT_TOO_LARGE',
  'RATE_LIMITED',
  'MUTATION_OUTCOME_UNKNOWN',
  'gate_failed',
] as const;

export type AdditionalPublicMemoryErrorCode =
  (typeof ADDITIONAL_PUBLIC_MEMORY_ERROR_CODES)[number];

export interface ErrorMappingSpecV1 {
  readonly source_code: PublicMemoryErrorCode;
  readonly public_code: PublicMemoryErrorCode;
  readonly is_error: true;
  readonly retryable: boolean;
  readonly requires_target_authorization_for_lifecycle_detail: boolean;
  readonly default_sanitized_message: string;
}

export const MEMORY_ERROR_MAPPING_TABLE: Readonly<
  Record<PublicMemoryErrorCode, ErrorMappingSpecV1>
> = {
  INVALID_SCHEMA: {
    source_code: 'INVALID_SCHEMA',
    public_code: 'INVALID_SCHEMA',
    is_error: true,
    retryable: false,
    requires_target_authorization_for_lifecycle_detail: false,
    default_sanitized_message:
      'Input or cursor failed closed schema validation.',
  },
  UNSUPPORTED_SCHEMA_VERSION: {
    source_code: 'UNSUPPORTED_SCHEMA_VERSION',
    public_code: 'UNSUPPORTED_SCHEMA_VERSION',
    is_error: true,
    retryable: false,
    requires_target_authorization_for_lifecycle_detail: false,
    default_sanitized_message:
      'Nested contract object uses an unsupported schema_version.',
  },
  INVALID_TIMESTAMP: {
    source_code: 'INVALID_TIMESTAMP',
    public_code: 'INVALID_TIMESTAMP',
    is_error: true,
    retryable: false,
    requires_target_authorization_for_lifecycle_detail: false,
    default_sanitized_message: 'Malformed ISO-8601 UTC timestamp.',
  },
  INVALID_DIGEST: {
    source_code: 'INVALID_DIGEST',
    public_code: 'INVALID_DIGEST',
    is_error: true,
    retryable: false,
    requires_target_authorization_for_lifecycle_detail: false,
    default_sanitized_message: 'Malformed SHA-256 digest.',
  },
  SCOPE_VIOLATION: {
    source_code: 'SCOPE_VIOLATION',
    public_code: 'SCOPE_VIOLATION',
    is_error: true,
    retryable: false,
    requires_target_authorization_for_lifecycle_detail: false,
    default_sanitized_message:
      'Target scope does not match the caller trusted scope.',
  },
  UNAUTHORIZED_PRINCIPAL: {
    source_code: 'UNAUTHORIZED_PRINCIPAL',
    public_code: 'UNAUTHORIZED_PRINCIPAL',
    is_error: true,
    retryable: false,
    requires_target_authorization_for_lifecycle_detail: false,
    default_sanitized_message:
      'Authenticated principal is not authorized for this operation.',
  },
  CONSENT_DENIED: {
    source_code: 'CONSENT_DENIED',
    public_code: 'CONSENT_DENIED',
    is_error: true,
    retryable: false,
    requires_target_authorization_for_lifecycle_detail: false,
    default_sanitized_message:
      'Consent policy denied memory capture or processing.',
  },
  CONSENT_REVOKED: {
    source_code: 'CONSENT_REVOKED',
    public_code: 'CONSENT_REVOKED',
    is_error: true,
    retryable: false,
    requires_target_authorization_for_lifecycle_detail: false,
    default_sanitized_message:
      'Consent governing the target memory has been revoked.',
  },
  SHARING_POLICY_DENIED: {
    source_code: 'SHARING_POLICY_DENIED',
    public_code: 'SHARING_POLICY_DENIED',
    is_error: true,
    retryable: false,
    requires_target_authorization_for_lifecycle_detail: false,
    default_sanitized_message:
      'Requested sharing_policy or sensitivity is disallowed by host policy.',
  },
  QUOTA_EXCEEDED: {
    source_code: 'QUOTA_EXCEEDED',
    public_code: 'QUOTA_EXCEEDED',
    is_error: true,
    retryable: true,
    requires_target_authorization_for_lifecycle_detail: false,
    default_sanitized_message: 'Scope or tenant memory quota exceeded.',
  },
  NOT_FOUND: {
    source_code: 'NOT_FOUND',
    public_code: 'NOT_FOUND',
    is_error: true,
    retryable: false,
    requires_target_authorization_for_lifecycle_detail: false,
    default_sanitized_message:
      'Target memory record was not found in the active scope.',
  },
  DUPLICATE_ID: {
    source_code: 'DUPLICATE_ID',
    public_code: 'DUPLICATE_ID',
    is_error: true,
    retryable: false,
    requires_target_authorization_for_lifecycle_detail: false,
    default_sanitized_message: 'Collision on a caller-supplied identifier.',
  },
  IDEMPOTENCY_CONFLICT: {
    source_code: 'IDEMPOTENCY_CONFLICT',
    public_code: 'IDEMPOTENCY_CONFLICT',
    is_error: true,
    retryable: false,
    requires_target_authorization_for_lifecycle_detail: false,
    default_sanitized_message:
      'idempotency_key was reused with a different canonical request payload.',
  },
  CONCURRENCY_CONFLICT: {
    source_code: 'CONCURRENCY_CONFLICT',
    public_code: 'CONCURRENCY_CONFLICT',
    is_error: true,
    retryable: true,
    requires_target_authorization_for_lifecycle_detail: false,
    default_sanitized_message:
      'Optimistic concurrency conflict or in-flight operation with the same idempotency_key.',
  },
  ILLEGAL_TRANSITION: {
    source_code: 'ILLEGAL_TRANSITION',
    public_code: 'ILLEGAL_TRANSITION',
    is_error: true,
    retryable: false,
    requires_target_authorization_for_lifecycle_detail: true,
    default_sanitized_message:
      'Requested lifecycle transition is illegal from the current record status.',
  },
  ALREADY_TERMINAL: {
    source_code: 'ALREADY_TERMINAL',
    public_code: 'ALREADY_TERMINAL',
    is_error: true,
    retryable: false,
    requires_target_authorization_for_lifecycle_detail: true,
    default_sanitized_message:
      'Target memory record is already in a terminal lifecycle state.',
  },
  LEGAL_HOLD_ACTIVE: {
    source_code: 'LEGAL_HOLD_ACTIVE',
    public_code: 'LEGAL_HOLD_ACTIVE',
    is_error: true,
    retryable: false,
    requires_target_authorization_for_lifecycle_detail: true,
    default_sanitized_message:
      'Erasure refused because legal_hold is active on the target record.',
  },
  EVIDENCE_UNVERIFIED: {
    source_code: 'EVIDENCE_UNVERIFIED',
    public_code: 'EVIDENCE_UNVERIFIED',
    is_error: true,
    retryable: false,
    requires_target_authorization_for_lifecycle_detail: false,
    default_sanitized_message:
      'Hard evidence verification failed for the supplied citations.',
  },
  EVIDENCE_DIGEST_MISMATCH: {
    source_code: 'EVIDENCE_DIGEST_MISMATCH',
    public_code: 'EVIDENCE_DIGEST_MISMATCH',
    is_error: true,
    retryable: false,
    requires_target_authorization_for_lifecycle_detail: false,
    default_sanitized_message:
      'Citation digest does not match the referenced artifact bytes.',
  },
  ADMISSION_REJECTED: {
    source_code: 'ADMISSION_REJECTED',
    public_code: 'ADMISSION_REJECTED',
    is_error: true,
    retryable: false,
    requires_target_authorization_for_lifecycle_detail: false,
    default_sanitized_message:
      'Direct admission was rejected by policy violation.',
  },
  QUARANTINED: {
    source_code: 'QUARANTINED',
    public_code: 'QUARANTINED',
    is_error: true,
    retryable: false,
    requires_target_authorization_for_lifecycle_detail: false,
    default_sanitized_message:
      'Operation is blocked because the record is quarantined.',
  },
  HASH_CHAIN_BROKEN: {
    source_code: 'HASH_CHAIN_BROKEN',
    public_code: 'HASH_CHAIN_BROKEN',
    is_error: true,
    retryable: false,
    requires_target_authorization_for_lifecycle_detail: false,
    default_sanitized_message:
      'Underlying append-only ledger integrity verification failed.',
  },
  SIGNATURE_INVALID: {
    source_code: 'SIGNATURE_INVALID',
    public_code: 'SIGNATURE_INVALID',
    is_error: true,
    retryable: false,
    requires_target_authorization_for_lifecycle_detail: false,
    default_sanitized_message: 'Cryptographic signature verification failed.',
  },
  BUNDLE_INTEGRITY_FAILED: {
    source_code: 'BUNDLE_INTEGRITY_FAILED',
    public_code: 'BUNDLE_INTEGRITY_FAILED',
    is_error: true,
    retryable: false,
    requires_target_authorization_for_lifecycle_detail: false,
    default_sanitized_message:
      'Upstream bundle reference failed integrity verification.',
  },
  ERASURE_INCOMPLETE: {
    source_code: 'ERASURE_INCOMPLETE',
    public_code: 'ERASURE_INCOMPLETE',
    is_error: true,
    retryable: true,
    requires_target_authorization_for_lifecycle_detail: false,
    default_sanitized_message:
      'Derived index or payload erasure did not complete; retry with the same idempotency_key.',
  },
  DEPENDENCY_UNAVAILABLE: {
    source_code: 'DEPENDENCY_UNAVAILABLE',
    public_code: 'DEPENDENCY_UNAVAILABLE',
    is_error: true,
    retryable: true,
    requires_target_authorization_for_lifecycle_detail: false,
    default_sanitized_message:
      'Required runtime port or policy dependency is temporarily unavailable.',
  },
  STORAGE_IO_ERROR: {
    source_code: 'STORAGE_IO_ERROR',
    public_code: 'STORAGE_IO_ERROR',
    is_error: true,
    retryable: true,
    requires_target_authorization_for_lifecycle_detail: false,
    default_sanitized_message:
      'Transient storage I/O failure before operation completion.',
  },
  RESULT_TOO_LARGE: {
    source_code: 'RESULT_TOO_LARGE',
    public_code: 'RESULT_TOO_LARGE',
    is_error: true,
    retryable: false,
    requires_target_authorization_for_lifecycle_detail: false,
    default_sanitized_message:
      'Serialized response exceeds the 64 KiB (65,536-byte) transport ceiling.',
  },
  RATE_LIMITED: {
    source_code: 'RATE_LIMITED',
    public_code: 'RATE_LIMITED',
    is_error: true,
    retryable: true,
    requires_target_authorization_for_lifecycle_detail: false,
    default_sanitized_message:
      'Per-principal or per-scope rate limit exceeded.',
  },
  MUTATION_OUTCOME_UNKNOWN: {
    source_code: 'MUTATION_OUTCOME_UNKNOWN',
    public_code: 'MUTATION_OUTCOME_UNKNOWN',
    is_error: true,
    retryable: true,
    requires_target_authorization_for_lifecycle_detail: false,
    default_sanitized_message:
      'Mutation commit outcome is indeterminate; retry safely with the same idempotency_key.',
  },
  gate_failed: {
    source_code: 'gate_failed',
    public_code: 'gate_failed',
    is_error: true,
    retryable: false,
    requires_target_authorization_for_lifecycle_detail: false,
    default_sanitized_message:
      'Capability gate or destructive confirmation gate refused execution.',
  },
} as const;

const TARGET_ID_MUTATION_TOOLS: ReadonlySet<EngramMemoryToolName> = new Set([
  'engram_memory_request_admission',
  'engram_memory_withdraw',
  'engram_memory_forget',
]);

/**
 * Scrubs filesystem paths, SQL fragments, and multiline stack traces from
 * public error messages.
 */
export function sanitizePublicErrorMessage(
  rawMessage: string | undefined,
  fallbackMessage: string,
): string {
  if (!rawMessage || typeof rawMessage !== 'string') {
    return fallbackMessage;
  }
  const firstLine = rawMessage.split(/\r?\n/)[0] ?? '';
  const singleLine = firstLine.trim();
  if (
    singleLine.length === 0 ||
    singleLine.length > 512 ||
    /(?:\/home\/|\/Users\/|[A-Za-z]:\\|\bSELECT\b.*\bFROM\b|\bINSERT\s+INTO\b|\bat\s+\S+\s*\()/i.test(
      singleLine,
    )
  ) {
    return fallbackMessage;
  }
  return singleLine;
}

export interface NeutralErrorMappingContextV1 {
  readonly tool: EngramMemoryToolName;
  readonly code: PublicMemoryErrorCode;
  readonly message?: string;
  readonly details?: Readonly<Record<string, string | number | boolean | null>>;
  /**
   * Whether the target `memory_id` has already been verified to exist within
   * the caller's authorized `ScopeRefV1`. Defaults to `true` for non-target
   * errors; when `false` on target-id mutation tools, existence/state leaks
   * normalize to `NOT_FOUND`.
   */
  readonly targetAuthorized?: boolean;
}

/**
 * Deterministically maps any neutral or public error code to a `ToolFailureV1`
 * and its wrapping `McpToolCallResponseV1<never>`, enforcing target-existence
 * disclosure protection on `request_admission`, `withdraw`, and `forget`.
 */
export function mapNeutralMemoryErrorToPublic(
  ctx: NeutralErrorMappingContextV1,
): McpToolCallResponseV1<never> {
  let effectiveCode: PublicMemoryErrorCode = ctx.code;
  let effectiveDetails = ctx.details;
  let effectiveMessage = ctx.message;

  if (
    TARGET_ID_MUTATION_TOOLS.has(ctx.tool) &&
    ctx.targetAuthorized === false &&
    (ctx.code === 'NOT_FOUND' ||
      ctx.code === 'SCOPE_VIOLATION' ||
      ctx.code === 'UNAUTHORIZED_PRINCIPAL' ||
      ctx.code === 'ILLEGAL_TRANSITION' ||
      ctx.code === 'ALREADY_TERMINAL' ||
      ctx.code === 'LEGAL_HOLD_ACTIVE')
  ) {
    effectiveCode = 'NOT_FOUND';
    effectiveDetails = undefined;
    effectiveMessage = undefined;
  }

  const spec = MEMORY_ERROR_MAPPING_TABLE[effectiveCode];
  const message = sanitizePublicErrorMessage(
    effectiveMessage,
    spec.default_sanitized_message,
  );

  const errorObj: ToolFailureV1['error'] =
    effectiveDetails && Object.keys(effectiveDetails).length > 0
      ? {
          code: spec.public_code,
          message,
          retryable: spec.retryable,
          details: effectiveDetails,
        }
      : {
          code: spec.public_code,
          message,
          retryable: spec.retryable,
        };

  const failure: ToolFailureV1 = {
    ok: false,
    schema_version: ENGRAM_MEMORY_SCHEMA_VERSION,
    tool: ctx.tool,
    error: errorObj,
  };

  return {
    isError: true,
    structuredContent: failure,
    content: [
      {
        type: 'text',
        text: JSON.stringify(failure),
      },
    ],
  };
}

export function isMutationTool(tool: EngramMemoryToolName): boolean {
  return (
    tool === 'engram_memory_capture' ||
    tool === 'engram_memory_request_admission' ||
    tool === 'engram_memory_withdraw' ||
    tool === 'engram_memory_forget'
  );
}

/**
 * Maps an unexpected dependency exception or timeout to a public MCP failure
 * envelope according to read vs mutation commit-phase semantics (§8).
 */
export function mapUnexpectedDependencyExceptionToPublic(input: {
  readonly tool: EngramMemoryToolName;
  readonly commitPhaseEntered: boolean;
  readonly classification?: 'storage_io' | 'dependency_unavailable' | 'timeout';
}): McpToolCallResponseV1<never> {
  if (isMutationTool(input.tool) && input.commitPhaseEntered) {
    return mapNeutralMemoryErrorToPublic({
      tool: input.tool,
      code: 'MUTATION_OUTCOME_UNKNOWN',
    });
  }
  const code: PublicMemoryErrorCode =
    input.classification === 'storage_io'
      ? 'STORAGE_IO_ERROR'
      : 'DEPENDENCY_UNAVAILABLE';
  return mapNeutralMemoryErrorToPublic({
    tool: input.tool,
    code,
  });
}
