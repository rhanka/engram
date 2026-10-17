/**
 * MCP-L0 Total Error Mapping Table & Disclosure-Safe Normalization Contract.
 *
 * Normative alignment with SPEC-memory-mcp-v2.md §M2 and §M6:
 * - Total over all 27 neutral `MemoryErrorCode` values from `engram-memory/contracts`
 *   plus the 4 MCP/Sentropic public codes (`RESULT_TOO_LARGE`, `RATE_LIMITED`,
 *   `MUTATION_OUTCOME_UNKNOWN`, `gate_failed`).
 * - Emits closed Sentropic `AppResultEnvelope` failure objects (`ToolFailureV1`).
 * - Always uses predefined constant sanitized messages; never echoes raw backend
 *   messages, filesystem paths, record bodies, target IDs, or `details`.
 * - Enforces pre-authorization target-existence normalization to `NOT_FOUND`
 *   across all four target-bearing tools (`engram_memory_get`,
 *   `engram_memory_request_admission`, `engram_memory_withdraw`,
 *   `engram_memory_forget`).
 */

import {
  ENGRAM_MEMORY_STRUCTURED_OUTPUT_SCHEMA_VERSION,
  type AdditionalPublicMemoryErrorCode,
  type EngramMemoryToolName,
  type McpToolCallResponseV1,
  type MemoryErrorCode,
  type MemoryErrorV1,
  type PublicMemoryErrorCode,
  type ToolFailureV1,
  type ToolSuccessV1,
} from './contracts.js';

export const NEUTRAL_MEMORY_ERROR_CODES = [
  'INVALID_SCHEMA',
  'INVALID_DIGEST',
  'DIGEST_CONFLICT',
  'UNAUTHORIZED',
  'AUTHORIZATION_EXPIRED',
  'AUTHORIZATION_REVOKED',
  'POLICY_UNAVAILABLE',
  'POLICY_STALE',
  'ILLEGAL_TRANSITION',
  'NOT_FOUND',
  'ALREADY_TERMINAL',
  'DEADLINE_EXCEEDED',
  'CANCELLED',
  'CAPABILITY_UNAVAILABLE',
  'STORE_UNAVAILABLE',
  'FENCE_LOST',
  'CURSOR_GAP',
  'JOURNAL_CORRUPT',
  'BLOB_MISSING',
  'PROJECTION_STALE',
  'PROJECTION_OVERSIZED',
  'RANKING_UNAVAILABLE',
  'STALE_PAGE',
  'REGISTRY_VERSION_UNAVAILABLE',
  'BACKUP_INVALID',
  'RESTORE_REFUSED',
  'MIGRATION_LEDGER_INVALID',
] as const satisfies readonly MemoryErrorCode[];

export type NeutralMemoryErrorCode =
  (typeof NEUTRAL_MEMORY_ERROR_CODES)[number];

export const ADDITIONAL_PUBLIC_MEMORY_ERROR_CODES = [
  'RESULT_TOO_LARGE',
  'RATE_LIMITED',
  'MUTATION_OUTCOME_UNKNOWN',
  'gate_failed',
] as const satisfies readonly AdditionalPublicMemoryErrorCode[];

export const PUBLIC_MEMORY_ERROR_CODES = [
  ...NEUTRAL_MEMORY_ERROR_CODES,
  ...ADDITIONAL_PUBLIC_MEMORY_ERROR_CODES,
] as const satisfies readonly PublicMemoryErrorCode[];

export interface ErrorMappingSpecV1 {
  readonly source_code: PublicMemoryErrorCode;
  readonly public_code: PublicMemoryErrorCode;
  readonly is_error: true;
  readonly retriable: boolean;
  readonly retryable: boolean;
  readonly requires_target_authorization_for_detail: boolean;
  readonly default_sanitized_message: string;
}

export const MEMORY_ERROR_MAPPING_TABLE: Readonly<
  Record<PublicMemoryErrorCode, ErrorMappingSpecV1>
> = {
  INVALID_SCHEMA: {
    source_code: 'INVALID_SCHEMA',
    public_code: 'INVALID_SCHEMA',
    is_error: true,
    retriable: false,
    retryable: false,
    requires_target_authorization_for_detail: false,
    default_sanitized_message:
      'Request arguments failed closed schema, NFC, or size validation.',
  },
  INVALID_DIGEST: {
    source_code: 'INVALID_DIGEST',
    public_code: 'INVALID_DIGEST',
    is_error: true,
    retriable: false,
    retryable: false,
    requires_target_authorization_for_detail: false,
    default_sanitized_message:
      'Supplied SHA-256 digest is malformed or failed verification.',
  },
  DIGEST_CONFLICT: {
    source_code: 'DIGEST_CONFLICT',
    public_code: 'DIGEST_CONFLICT',
    is_error: true,
    retriable: false,
    retryable: false,
    requires_target_authorization_for_detail: true,
    default_sanitized_message:
      'Idempotency key or target identifier was reused with conflicting canonical content.',
  },
  UNAUTHORIZED: {
    source_code: 'UNAUTHORIZED',
    public_code: 'UNAUTHORIZED',
    is_error: true,
    retriable: false,
    retryable: false,
    requires_target_authorization_for_detail: true,
    default_sanitized_message:
      'Caller is not authorized to perform this memory operation in the resolved scope.',
  },
  AUTHORIZATION_EXPIRED: {
    source_code: 'AUTHORIZATION_EXPIRED',
    public_code: 'AUTHORIZATION_EXPIRED',
    is_error: true,
    retriable: false,
    retryable: false,
    requires_target_authorization_for_detail: true,
    default_sanitized_message:
      'Authorization grant or confirmation binding has expired.',
  },
  AUTHORIZATION_REVOKED: {
    source_code: 'AUTHORIZATION_REVOKED',
    public_code: 'AUTHORIZATION_REVOKED',
    is_error: true,
    retriable: false,
    retryable: false,
    requires_target_authorization_for_detail: true,
    default_sanitized_message:
      'Authorization grant or trust binding has been revoked.',
  },
  POLICY_UNAVAILABLE: {
    source_code: 'POLICY_UNAVAILABLE',
    public_code: 'POLICY_UNAVAILABLE',
    is_error: true,
    retriable: true,
    retryable: true,
    requires_target_authorization_for_detail: false,
    default_sanitized_message:
      'Authorization or admission policy authority is temporarily unavailable.',
  },
  POLICY_STALE: {
    source_code: 'POLICY_STALE',
    public_code: 'POLICY_STALE',
    is_error: true,
    retriable: true,
    retryable: true,
    requires_target_authorization_for_detail: false,
    default_sanitized_message:
      'Policy epoch or trust state is stale; retry with refreshed policy state.',
  },
  ILLEGAL_TRANSITION: {
    source_code: 'ILLEGAL_TRANSITION',
    public_code: 'ILLEGAL_TRANSITION',
    is_error: true,
    retriable: false,
    retryable: false,
    requires_target_authorization_for_detail: true,
    default_sanitized_message:
      'Requested lifecycle transition is not permitted from the current state.',
  },
  NOT_FOUND: {
    source_code: 'NOT_FOUND',
    public_code: 'NOT_FOUND',
    is_error: true,
    retriable: false,
    retryable: false,
    requires_target_authorization_for_detail: false,
    default_sanitized_message:
      'Requested memory resource was not found in the authorized scope.',
  },
  ALREADY_TERMINAL: {
    source_code: 'ALREADY_TERMINAL',
    public_code: 'ALREADY_TERMINAL',
    is_error: true,
    retriable: false,
    retryable: false,
    requires_target_authorization_for_detail: true,
    default_sanitized_message:
      'Target memory resource is already in a terminal lifecycle state.',
  },
  DEADLINE_EXCEEDED: {
    source_code: 'DEADLINE_EXCEEDED',
    public_code: 'DEADLINE_EXCEEDED',
    is_error: true,
    retriable: true,
    retryable: true,
    requires_target_authorization_for_detail: false,
    default_sanitized_message:
      'Memory operation exceeded the invocation deadline budget.',
  },
  CANCELLED: {
    source_code: 'CANCELLED',
    public_code: 'CANCELLED',
    is_error: true,
    retriable: true,
    retryable: true,
    requires_target_authorization_for_detail: false,
    default_sanitized_message:
      'Memory operation was cancelled before completion.',
  },
  CAPABILITY_UNAVAILABLE: {
    source_code: 'CAPABILITY_UNAVAILABLE',
    public_code: 'CAPABILITY_UNAVAILABLE',
    is_error: true,
    retriable: false,
    retryable: false,
    requires_target_authorization_for_detail: false,
    default_sanitized_message:
      'Requested memory capability or required neutral port facet is unavailable.',
  },
  STORE_UNAVAILABLE: {
    source_code: 'STORE_UNAVAILABLE',
    public_code: 'STORE_UNAVAILABLE',
    is_error: true,
    retriable: true,
    retryable: true,
    requires_target_authorization_for_detail: false,
    default_sanitized_message:
      'Memory substrate store is temporarily unavailable.',
  },
  FENCE_LOST: {
    source_code: 'FENCE_LOST',
    public_code: 'FENCE_LOST',
    is_error: true,
    retriable: true,
    retryable: true,
    requires_target_authorization_for_detail: false,
    default_sanitized_message:
      'Writer lease fence was lost during operation; retry safely.',
  },
  CURSOR_GAP: {
    source_code: 'CURSOR_GAP',
    public_code: 'CURSOR_GAP',
    is_error: true,
    retriable: true,
    retryable: true,
    requires_target_authorization_for_detail: false,
    default_sanitized_message:
      'Transient cursor synchronization gap detected; retry operation.',
  },
  JOURNAL_CORRUPT: {
    source_code: 'JOURNAL_CORRUPT',
    public_code: 'JOURNAL_CORRUPT',
    is_error: true,
    retriable: false,
    retryable: false,
    requires_target_authorization_for_detail: false,
    default_sanitized_message:
      'Memory store integrity check failed; operation refused.',
  },
  BLOB_MISSING: {
    source_code: 'BLOB_MISSING',
    public_code: 'BLOB_MISSING',
    is_error: true,
    retriable: false,
    retryable: false,
    requires_target_authorization_for_detail: true,
    default_sanitized_message:
      'Referenced memory artifact content is missing from the store.',
  },
  PROJECTION_STALE: {
    source_code: 'PROJECTION_STALE',
    public_code: 'PROJECTION_STALE',
    is_error: true,
    retriable: true,
    retryable: true,
    requires_target_authorization_for_detail: false,
    default_sanitized_message:
      'Derived recall projection has not caught up to the required fence.',
  },
  PROJECTION_OVERSIZED: {
    source_code: 'PROJECTION_OVERSIZED',
    public_code: 'PROJECTION_OVERSIZED',
    is_error: true,
    retriable: false,
    retryable: false,
    requires_target_authorization_for_detail: false,
    default_sanitized_message:
      'Projected memory packet exceeds the configured packet byte budget.',
  },
  RANKING_UNAVAILABLE: {
    source_code: 'RANKING_UNAVAILABLE',
    public_code: 'RANKING_UNAVAILABLE',
    is_error: true,
    retriable: true,
    retryable: true,
    requires_target_authorization_for_detail: false,
    default_sanitized_message:
      'Requested ranking channel is temporarily unavailable.',
  },
  STALE_PAGE: {
    source_code: 'STALE_PAGE',
    public_code: 'STALE_PAGE',
    is_error: true,
    retriable: false,
    retryable: false,
    requires_target_authorization_for_detail: false,
    default_sanitized_message:
      'Pagination handle is unknown, expired, or no longer matches current epochs.',
  },
  REGISTRY_VERSION_UNAVAILABLE: {
    source_code: 'REGISTRY_VERSION_UNAVAILABLE',
    public_code: 'REGISTRY_VERSION_UNAVAILABLE',
    is_error: true,
    retriable: false,
    retryable: false,
    requires_target_authorization_for_detail: false,
    default_sanitized_message:
      'Required schema or policy registry version is unavailable.',
  },
  BACKUP_INVALID: {
    source_code: 'BACKUP_INVALID',
    public_code: 'BACKUP_INVALID',
    is_error: true,
    retriable: false,
    retryable: false,
    requires_target_authorization_for_detail: false,
    default_sanitized_message:
      'Internal backup validation error encountered in memory store.',
  },
  RESTORE_REFUSED: {
    source_code: 'RESTORE_REFUSED',
    public_code: 'RESTORE_REFUSED',
    is_error: true,
    retriable: false,
    retryable: false,
    requires_target_authorization_for_detail: false,
    default_sanitized_message:
      'Internal restore state refused the memory operation.',
  },
  MIGRATION_LEDGER_INVALID: {
    source_code: 'MIGRATION_LEDGER_INVALID',
    public_code: 'MIGRATION_LEDGER_INVALID',
    is_error: true,
    retriable: false,
    retryable: false,
    requires_target_authorization_for_detail: false,
    default_sanitized_message:
      'Memory store migration ledger state is invalid.',
  },
  RESULT_TOO_LARGE: {
    source_code: 'RESULT_TOO_LARGE',
    public_code: 'RESULT_TOO_LARGE',
    is_error: true,
    retriable: false,
    retryable: false,
    requires_target_authorization_for_detail: false,
    default_sanitized_message:
      'Serialized response exceeds the configured packet or transport byte ceiling.',
  },
  RATE_LIMITED: {
    source_code: 'RATE_LIMITED',
    public_code: 'RATE_LIMITED',
    is_error: true,
    retriable: true,
    retryable: true,
    requires_target_authorization_for_detail: false,
    default_sanitized_message:
      'Per-principal or per-scope invocation rate limit exceeded.',
  },
  MUTATION_OUTCOME_UNKNOWN: {
    source_code: 'MUTATION_OUTCOME_UNKNOWN',
    public_code: 'MUTATION_OUTCOME_UNKNOWN',
    is_error: true,
    retriable: true,
    retryable: true,
    requires_target_authorization_for_detail: false,
    default_sanitized_message:
      'Mutation commit outcome is indeterminate; retry safely with the same idempotency_key.',
  },
  gate_failed: {
    source_code: 'gate_failed',
    public_code: 'gate_failed',
    is_error: true,
    retriable: false,
    retryable: false,
    requires_target_authorization_for_detail: false,
    default_sanitized_message:
      'Capability gate or human confirmation gate refused execution.',
  },
} as const;

/**
 * M4 / M6 target-bearing tools that MUST NOT disclose whether a target
 * `record_id` or `candidate_id` exists in another scope or what lifecycle
 * state/digest it has prior to successful target-scope authorization.
 */
export const TARGET_BEARING_MEMORY_TOOLS: ReadonlySet<EngramMemoryToolName> =
  new Set<EngramMemoryToolName>([
    'engram_memory_get',
    'engram_memory_request_admission',
    'engram_memory_withdraw',
    'engram_memory_forget',
  ]);

const TARGET_EXISTENCE_SENSITIVE_CODES: ReadonlySet<PublicMemoryErrorCode> =
  new Set<PublicMemoryErrorCode>([
    'NOT_FOUND',
    'UNAUTHORIZED',
    'AUTHORIZATION_EXPIRED',
    'AUTHORIZATION_REVOKED',
    'ILLEGAL_TRANSITION',
    'ALREADY_TERMINAL',
    'DIGEST_CONFLICT',
    'BLOB_MISSING',
  ]);

/**
 * M6 disclosure-safe message policy:
 * Public error messages are strictly constant strings from
 * `MEMORY_ERROR_MAPPING_TABLE`. Raw backend messages, paths, SQL, stack traces,
 * record bodies, and target identifiers are unconditionally discarded.
 */
export function sanitizePublicErrorMessage(
  _rawMessage: string | undefined,
  fallbackMessage: string,
): string {
  return fallbackMessage;
}

export const TRUSTED_CONTEXT_UNAVAILABLE_PROTOCOL_ERROR = {
  code: -32603,
  message: 'Trusted invocation context unavailable',
} as const;

export type McpProtocolErrorObjectV1 =
  typeof TRUSTED_CONTEXT_UNAVAILABLE_PROTOCOL_ERROR;

export class TrustedContextUnavailableProtocolError extends Error {
  readonly code = -32603 as const;
  readonly protocolError: McpProtocolErrorObjectV1 =
    TRUSTED_CONTEXT_UNAVAILABLE_PROTOCOL_ERROR;

  constructor() {
    super(TRUSTED_CONTEXT_UNAVAILABLE_PROTOCOL_ERROR.message);
    this.name = 'TrustedContextUnavailableProtocolError';
  }
}

function hasLoneSurrogateInAuditId(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < value.length ? value.charCodeAt(i + 1) : 0;
      if (next < 0xdc00 || next > 0xdfff) return true;
      i++;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

export function isValidTrustedAuditId(auditId: unknown): auditId is string {
  if (
    typeof auditId !== 'string' ||
    auditId === 'audit_mcp_l0_default' ||
    hasLoneSurrogateInAuditId(auditId) ||
    auditId.normalize('NFC') !== auditId ||
    auditId.trim().length === 0
  ) {
    return false;
  }
  const bytes = Buffer.byteLength(auditId, 'utf8');
  return bytes >= 1 && bytes <= 512;
}

function requireTrustedAuditId(auditId: unknown): string {
  if (!isValidTrustedAuditId(auditId)) {
    throw new TrustedContextUnavailableProtocolError();
  }
  return auditId;
}

export type TrustedAuditDispatchGuardResultV1<T> =
  | {
      readonly ok: true;
      readonly auditId: string;
      readonly providerDispatched: true;
      readonly response: McpToolCallResponseV1<T>;
    }
  | {
      readonly ok: false;
      readonly protocolError: McpProtocolErrorObjectV1;
      readonly providerDispatched: false;
      readonly reservationCreated: false;
      readonly canonicalEffectCommitted: false;
    };

/**
 * M2 / M6 Host dispatch guard for trusted `auditId` (`A10-R5-AUDIT` / `M2-AUDIT-MISSING`).
 *
 * When the host/broker fails to supply a valid trusted `auditId`, the call is
 * refused at the protocol boundary with `{ code: -32603, message: "Trusted invocation context unavailable" }`
 * BEFORE provider dispatch, reservation, or canonical effect, and WITHOUT any
 * domain `AppResultEnvelope` (`structuredContent` / `CallToolResult`).
 */
export function guardTrustedAuditDispatchV1<T>(
  auditId: unknown,
  dispatchProvider: (trustedAuditId: string) => McpToolCallResponseV1<T>,
): TrustedAuditDispatchGuardResultV1<T> {
  if (!isValidTrustedAuditId(auditId)) {
    return {
      ok: false,
      protocolError: TRUSTED_CONTEXT_UNAVAILABLE_PROTOCOL_ERROR,
      providerDispatched: false,
      reservationCreated: false,
      canonicalEffectCommitted: false,
    };
  }
  return {
    ok: true,
    auditId,
    providerDispatched: true,
    response: dispatchProvider(auditId),
  };
}

export interface NeutralErrorMappingContextV1 {
  readonly tool: EngramMemoryToolName;
  readonly code?: PublicMemoryErrorCode;
  readonly error?: MemoryErrorV1;
  readonly message?: string;
  readonly retryable?: boolean;
  readonly denial?: boolean;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly auditId: string;
  /**
   * Closed-world literal-`true` verdict (`targetAuthorized === true`).
   * Whenever `targetAuthorized !== true` (including `undefined`, `false`, `null`,
   * `"true"`, or `1`) on any target-bearing tool (`get`, `request_admission`,
   * `withdraw`, `forget`), existence/state/digest codes normalize to `NOT_FOUND`.
   */
  readonly targetAuthorized?: boolean;
}

/**
 * Deterministically maps any neutral `MemoryErrorV1` or `PublicMemoryErrorCode`
 * to a closed `ToolFailureV1` (`AppResultEnvelope`) and its wrapping
 * `McpToolCallResponseV1<never>`, stripping all `details` and raw backend
 * messages and enforcing closed-world pre-auth target-existence protection
 * (`targetAuthorized === true`) across all target-bearing tools (`get`,
 * `request_admission`, `withdraw`, `forget`).
 *
 * Requires a valid trusted host `auditId`; never fabricates a fallback audit ID.
 */
export function mapNeutralMemoryErrorToPublic(
  ctx: NeutralErrorMappingContextV1,
): McpToolCallResponseV1<never> {
  const auditId = requireTrustedAuditId(
    (ctx as { auditId?: unknown }).auditId,
  );
  const sourceError = ctx.error;
  const isDenial = ctx.denial === true || sourceError?.denial === true;
  const rawCode: PublicMemoryErrorCode =
    sourceError?.code ?? ctx.code ?? 'STORE_UNAVAILABLE';

  let effectiveCode: PublicMemoryErrorCode = isDenial
    ? 'UNAUTHORIZED'
    : rawCode;
  if (!(effectiveCode in MEMORY_ERROR_MAPPING_TABLE)) {
    effectiveCode = 'STORE_UNAVAILABLE';
  }

  const targetAuthorized =
    (ctx as { targetAuthorized?: unknown }).targetAuthorized === true;

  let normalizedToNotFound = false;
  if (
    TARGET_BEARING_MEMORY_TOOLS.has(ctx.tool) &&
    !targetAuthorized &&
    (isDenial || TARGET_EXISTENCE_SENSITIVE_CODES.has(effectiveCode))
  ) {
    effectiveCode = 'NOT_FOUND';
    normalizedToNotFound = true;
  }

  const spec = MEMORY_ERROR_MAPPING_TABLE[effectiveCode];
  const explicitRetryable = sourceError?.retryable ?? ctx.retryable;
  const retriable = normalizedToNotFound
    ? false
    : isDenial
      ? false
      : typeof explicitRetryable === 'boolean'
        ? explicitRetryable
        : spec.retriable;

  const failure: ToolFailureV1 = {
    ok: false,
    auditId,
    redactionClass: 'high',
    error: {
      code: spec.public_code,
      message: sanitizePublicErrorMessage(
        sourceError?.message ?? ctx.message,
        spec.default_sanitized_message,
      ),
      retriable,
    },
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

export function createToolSuccessEnvelope<T>(
  value: T,
  auditId: string,
): McpToolCallResponseV1<T> {
  const effectiveAuditId = requireTrustedAuditId(auditId);
  const envelope: ToolSuccessV1<T> = {
    ok: true,
    output: {
      schema_version: ENGRAM_MEMORY_STRUCTURED_OUTPUT_SCHEMA_VERSION,
      value,
    },
    auditId: effectiveAuditId,
    redactionClass: 'high',
  };

  return {
    isError: false,
    structuredContent: envelope,
    content: [
      {
        type: 'text',
        text: JSON.stringify(envelope),
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
 * Maps an uncaught dependency exception or timeout to a public MCP failure
 * envelope according to M6 read vs mutation commit-phase semantics:
 * - Reads or pre-commit failures map to `STORE_UNAVAILABLE` (or classified
 *   `CAPABILITY_UNAVAILABLE` / `DEADLINE_EXCEEDED` / `POLICY_UNAVAILABLE`).
 * - Mutations whose commit phase was entered map to `MUTATION_OUTCOME_UNKNOWN`.
 *
 * Requires a valid trusted host `auditId`; never fabricates a fallback audit ID.
 */
export function mapUnexpectedDependencyExceptionToPublic(input: {
  readonly tool: EngramMemoryToolName;
  readonly commitPhaseEntered: boolean;
  readonly classification?:
    | 'store_unavailable'
    | 'storage_io'
    | 'dependency_unavailable'
    | 'capability_unavailable'
    | 'deadline_exceeded'
    | 'timeout'
    | 'policy_unavailable';
  readonly auditId: string;
}): McpToolCallResponseV1<never> {
  const auditId = requireTrustedAuditId(
    (input as { auditId?: unknown }).auditId,
  );
  if (isMutationTool(input.tool) && input.commitPhaseEntered === true) {
    return mapNeutralMemoryErrorToPublic({
      tool: input.tool,
      code: 'MUTATION_OUTCOME_UNKNOWN',
      auditId,
      targetAuthorized: true,
    });
  }

  let code: PublicMemoryErrorCode = 'STORE_UNAVAILABLE';
  if (input.classification === 'capability_unavailable') {
    code = 'CAPABILITY_UNAVAILABLE';
  } else if (
    input.classification === 'deadline_exceeded' ||
    input.classification === 'timeout'
  ) {
    code = 'DEADLINE_EXCEEDED';
  } else if (input.classification === 'policy_unavailable') {
    code = 'POLICY_UNAVAILABLE';
  }

  return mapNeutralMemoryErrorToPublic({
    tool: input.tool,
    code,
    auditId,
    targetAuthorized: true,
  });
}
