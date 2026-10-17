/**
 * MCP-L0 Frozen Tool & Substrate Contracts for Engram Agent Memory.
 *
 * Normative alignment with SPEC-memory-mcp-v2.md (M1, M2, M3, M4, M5, M6):
 * - Six public MCP memory tools (`engram_memory_*`)
 * - Reuses neutral DTOs and V3/V1 read facets from `engram-memory/contracts`
 * - Closed M2 input DTOs and Sentropic `AppResultEnvelope` output envelopes
 * - Current-only memory disclosure (disputed memories are never searchable/readable)
 * - Host-managed random pagination handle state and bindings (M3)
 */

import type {
  AdmissionDecision,
  AdmissionDecisionEnvelopeV1,
  AdmissionOutcomeV1,
  AdmissionPolicy,
  AdmissionPolicyRequestV1,
  AdmissionRequestV1,
  AuthorizationAllowedV1,
  AuthorizationContextV1,
  AuthorizationDeniedV1,
  AuthorizationPort,
  AuthorizationRequestV1,
  AuthorizationResourceV1,
  AuthorizationResultV1,
  AuthorizationRevalidationV1,
  CandidatePayloadV2,
  CaptureAcknowledgementV1,
  CaptureRequestV2,
  CitationLocatorV1,
  CitationV1,
  Cursor,
  DerivationLineageV1,
  Digest,
  EvidenceBundleV1,
  EvidenceClass,
  EvidenceVerificationRequestV1,
  EvidenceVerifierPort,
  IdempotencyKey,
  Instant,
  JsonPointer,
  LifecycleCommandBaseV1,
  LifecycleCommandV1,
  LifecycleEventAnchorV1,
  LifecycleReceiptV1,
  MemoryComponentKind,
  MemoryComponentV2,
  MemoryErrorCode,
  MemoryErrorV1,
  MemoryOperation,
  MemoryPortV2,
  MemoryReadPacketV1,
  MemoryReadPortV1,
  MemoryReadReceiptV1,
  MemoryRecallPortV3,
  MemoryRecordV2,
  MemoryState,
  OpaqueRef,
  PrimaryEventAnchorV1,
  RankReceiptV1,
  RecallCapabilityPolicyV1,
  RecallPacketV2,
  RecallPacketV3,
  RecallRecordPacketV2,
  RecallRecordPacketV3,
  RecallRequestV2,
  ReconciliationConsentV1,
  RedactedMemoryRecordV2,
  RedactionDirectiveV1,
  Result,
  RetentionV1,
  TrustBindingV1,
  TrustRevalidationV1,
  ValidIntervalV1,
} from '../../../engram-memory/dist/contracts/index.js';

export type {
  AdmissionDecision,
  AdmissionDecisionEnvelopeV1,
  AdmissionOutcomeV1,
  AdmissionPolicy,
  AdmissionPolicyRequestV1,
  AdmissionRequestV1,
  AuthorizationAllowedV1,
  AuthorizationContextV1,
  AuthorizationDeniedV1,
  AuthorizationPort,
  AuthorizationRequestV1,
  AuthorizationResourceV1,
  AuthorizationResultV1,
  AuthorizationRevalidationV1,
  CandidatePayloadV2,
  CaptureAcknowledgementV1,
  CaptureRequestV2,
  CitationLocatorV1,
  CitationV1,
  Cursor,
  DerivationLineageV1,
  Digest,
  EvidenceBundleV1,
  EvidenceClass,
  EvidenceVerificationRequestV1,
  EvidenceVerifierPort,
  IdempotencyKey,
  Instant,
  JsonPointer,
  LifecycleCommandBaseV1,
  LifecycleCommandV1,
  LifecycleEventAnchorV1,
  LifecycleReceiptV1,
  MemoryComponentKind,
  MemoryComponentV2,
  MemoryErrorCode,
  MemoryErrorV1,
  MemoryOperation,
  MemoryPortV2,
  MemoryReadPacketV1,
  MemoryReadPortV1,
  MemoryReadReceiptV1,
  MemoryRecallPortV3,
  MemoryRecordV2,
  MemoryState,
  OpaqueRef,
  PrimaryEventAnchorV1,
  RankReceiptV1,
  RecallCapabilityPolicyV1,
  RecallPacketV2,
  RecallPacketV3,
  RecallRecordPacketV2,
  RecallRecordPacketV3,
  RecallRequestV2,
  ReconciliationConsentV1,
  RedactedMemoryRecordV2,
  RedactionDirectiveV1,
  Result,
  RetentionV1,
  TrustBindingV1,
  TrustRevalidationV1,
  ValidIntervalV1,
};

export const ENGRAM_MEMORY_MCP_CONTRACT_VERSION = '1.0.0' as const;
export const ENGRAM_MEMORY_PROVIDER_ID = 'sentropic.engram.memory' as const;
export const ENGRAM_MEMORY_CONNECTOR_ID = 'engram-memory' as const;
export const ENGRAM_MEMORY_APP_ID = 'engram' as const;
export const ENGRAM_MEMORY_STRUCTURED_OUTPUT_SCHEMA_VERSION = 1 as const;
export const ENGRAM_MEMORY_CANDIDATE_SCHEMA_VERSION = 2 as const;

export const ENGRAM_MEMORY_TOOL_NAMES = [
  'engram_memory_search',
  'engram_memory_get',
  'engram_memory_capture',
  'engram_memory_request_admission',
  'engram_memory_withdraw',
  'engram_memory_forget',
] as const;

export type EngramMemoryToolName = (typeof ENGRAM_MEMORY_TOOL_NAMES)[number];

/**
 * M1 / M4 mapping between the six agent-facing tools, the neutral port facets,
 * and the required `MemoryOperation` authority.
 */
export const ENGRAM_MEMORY_TOOL_NEUTRAL_BINDINGS = {
  engram_memory_search: {
    facet: 'MemoryRecallPortV3.recall',
    neutral_operation: 'recall_current',
  },
  engram_memory_get: {
    facet: 'MemoryReadPortV1.readCurrent',
    neutral_operation: 'recall_current',
  },
  engram_memory_capture: {
    facet: 'MemoryPortV2.capture',
    neutral_operation: 'capture',
  },
  engram_memory_request_admission: {
    facet: 'MemoryPortV2.requestAdmission',
    neutral_operation: 'request_admission',
  },
  engram_memory_withdraw: {
    facet: 'MemoryPortV2.transition',
    transition_operation: 'withdraw',
    neutral_operation: 'withdraw',
  },
  engram_memory_forget: {
    facet: 'MemoryPortV2.transition',
    transition_operation: 'tombstone',
    neutral_operation: 'tombstone',
  },
} as const;

/**
 * M1 operations that remain strictly outside the agent MCP surface.
 */
export const EXCLUDED_INTERNAL_MEMORY_OPERATIONS = [
  'admin',
  'bootstrap',
  'rotate',
  'revoke',
  'ingestActivity',
  'invalidateProjections',
  'backup',
  'restore',
  'migrate',
  'proposeCapitalisation',
  'proposeReconciliation',
  'supersede',
  'dispute',
  'resolve_dispute',
  'rewind',
  'expire',
  'mark_non_current',
  'trust_invalidate',
  'reject',
  'capabilities',
  'readiness',
  'validate',
  'cancelCapture',
  'recall_history',
  'recall_disputed',
  'inspect_candidate',
] as const;

export type ExcludedInternalMemoryOperation =
  (typeof EXCLUDED_INTERNAL_MEMORY_OPERATIONS)[number];

/**
 * M1 / M3 current-memory-only disclosure rule:
 * Search and get expose `accepted_current` records only. They MUST NOT expose
 * disputed (`accepted_disputed`), pending, rejected, withdrawn, historical,
 * expired, trust-invalid, or tombstoned records.
 */
export const DISCLOSABLE_MEMORY_STATES = ['accepted_current'] as const;
export type DisclosableMemoryState = (typeof DISCLOSABLE_MEMORY_STATES)[number];

export const NON_DISCLOSABLE_MEMORY_STATES = [
  'pending',
  'rejected',
  'withdrawn',
  'accepted_disputed',
  'historical',
  'expired',
  'trust_invalid',
  'tombstoned',
] as const satisfies ReadonlyArray<Exclude<MemoryState, DisclosableMemoryState>>;

export function isDisclosableMemoryState(
  state: unknown,
): state is DisclosableMemoryState {
  return state === 'accepted_current';
}

/**
 * M2 limits and defaults (SPEC-memory-mcp-v3.1.md lines 234–281).
 *
 * Published JSON Schema character-count `minLength` for any string with UTF-8
 * byte interval `[min, max]` MUST be `<= ceil(min / 4)` and `maxLength >= max`.
 */
export const MEMORY_MCP_LIMITS = {
  QUERY_MIN_UTF8_BYTES: 1,
  QUERY_MAX_UTF8_BYTES: 8192,
  LIMIT_MIN: 1,
  LIMIT_MAX: 50,
  LIMIT_DEFAULT: 10,
  MAX_PACKET_BYTES_MIN: 4096,
  MAX_PACKET_BYTES_MAX: 1048576,
  MAX_PACKET_BYTES_DEFAULT: 65536,
  OPAQUE_REF_MIN_UTF8_BYTES: 1,
  OPAQUE_REF_MAX_UTF8_BYTES: 512,
  IDEMPOTENCY_KEY_MIN_UTF8_BYTES: 16,
  IDEMPOTENCY_KEY_MAX_UTF8_BYTES: 256,
  IDEMPOTENCY_KEY_SCHEMA_MIN_LENGTH: 4,
  IDEMPOTENCY_KEY_SCHEMA_MAX_LENGTH: 256,
  CANDIDATE_ID_MIN_UTF8_BYTES: 1,
  CANDIDATE_ID_MAX_UTF8_BYTES: 512,
  CITATION_LOCATOR_SCHEME_MIN_UTF8_BYTES: 1,
  CITATION_LOCATOR_SCHEME_MAX_UTF8_BYTES: 512,
  CITATION_LOCATOR_VALUE_MIN_UTF8_BYTES: 1,
  CITATION_LOCATOR_VALUE_MAX_UTF8_BYTES: 512,
  RECORD_ID_PATTERN: '^mem_[a-z2-7]+$',
  DIGEST_PATTERN: '^sha256:[0-9a-f]{64}$',
  CURSOR_PATTERN: '^(0|[1-9][0-9]*)$',
  INSTANT_PATTERN: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$',
  COMPONENTS_MIN_ITEMS: 1,
  COMPONENTS_MAX_ITEMS: 64,
  COMPONENT_TEXT_MIN_UTF8_BYTES: 1,
  COMPONENT_TEXT_MAX_UTF8_BYTES: 65536,
  CITATIONS_MIN_ITEMS: 1,
  CITATIONS_MAX_ITEMS: 256,
  RECONCILIATION_FAMILY_REFS_MIN_ITEMS: 0,
  RECONCILIATION_FAMILY_REFS_MAX_ITEMS: 64,
  DERIVATION_SOURCE_RECORD_IDS_MIN_ITEMS: 1,
  DERIVATION_SOURCE_RECORD_IDS_MAX_ITEMS: 64,
  MAX_ARGUMENT_OBJECT_UTF8_BYTES: 1048576,
  MAX_TRANSPORT_COMBINED_SERIALIZED_UTF8_BYTES: 2097152,
  MAX_INVOCATION_DEADLINE_MS: 30000,
  CONFIRMATION_MAX_TTL_SECONDS: 300,
  CONFIRMATION_MAX_EXECUTION_SECONDS: 30,
  AUTHORIZATION_RECEIPT_MAX_TTL_SECONDS: 300,
} as const;

export const DEFAULT_RECALL_CAPABILITY_POLICY: RecallCapabilityPolicyV1 = {
  minimum_channels: 'lexical',
  network: 'forbid',
} as const;

/**
 * M2 Closed Input Contracts (copied from SPEC-memory-mcp-v2.md §M2).
 */
export type SearchInputV1 = {
  query: string;
  purpose_ref: OpaqueRef;
  limit?: number;
  max_packet_bytes?: number;
  capability_policy?: RecallCapabilityPolicyV1;
  page_cursor?: OpaqueRef;
};

export type GetInputV1 = {
  record_id: string;
  purpose_ref: OpaqueRef;
  max_packet_bytes?: number;
};

export type CapturePayloadInputV1 = Omit<
  CandidatePayloadV2,
  'scope_ref' | 'derivation' | 'retention' | 'reconciliation'
> & {
  retention?: RetentionV1;
  reconciliation?: ReconciliationConsentV1;
};

export type CaptureInputV1 = {
  idempotency_key: IdempotencyKey;
  payload: CapturePayloadInputV1;
  evidence: EvidenceBundleV1;
};

export type RequestAdmissionInputV1 = {
  candidate_id: string;
  idempotency_key: IdempotencyKey;
};

export type WithdrawInputV1 = {
  candidate_id: string;
  idempotency_key: IdempotencyKey;
  reason_ref: OpaqueRef;
};

export type ForgetInputV1 = {
  record_id: string;
  idempotency_key: IdempotencyKey;
  reason_ref: OpaqueRef;
};

/**
 * M2 Result Payload Contracts (copied from SPEC-memory-mcp-v2.md §M2).
 */
export type SearchPageV1 = {
  records: RecallRecordPacketV3[];
  rank_receipt: RankReceiptV1;
  next_page_cursor?: OpaqueRef;
  response_digest: Digest;
};

export type SearchOutputV1 = SearchPageV1;
export type GetOutputV1 = MemoryReadPacketV1;

export type CaptureOutputV1 = {
  status: 'committed_pending' | 'duplicate_exact';
  candidate_id: string;
  record_digest?: Digest;
  cursor: Cursor;
  transaction_receipt_digest: Digest;
};

export type RequestAdmissionOutputV1 = {
  outcome: AdmissionOutcomeV1;
  replayed: boolean;
};

export type WithdrawLifecycleReceiptV1 = LifecycleReceiptV1 & {
  operation: 'withdraw';
  from_state: 'pending';
  to_state: 'withdrawn';
};

export type WithdrawOutputV1 = {
  receipt: WithdrawLifecycleReceiptV1;
  replayed: boolean;
  key_destruction: 'pending' | 'complete';
};

export const TOMBSTONE_ALLOWED_FROM_STATES = [
  'accepted_current',
  'accepted_disputed',
  'historical',
  'expired',
  'trust_invalid',
] as const satisfies ReadonlyArray<MemoryState>;

export type TombstoneAllowedFromState =
  (typeof TOMBSTONE_ALLOWED_FROM_STATES)[number];

export type ForgetLifecycleReceiptV1 = LifecycleReceiptV1 & {
  operation: 'tombstone';
  from_state: TombstoneAllowedFromState;
  to_state: 'tombstoned';
};

export type ForgetOutputV1 = {
  receipt: ForgetLifecycleReceiptV1;
  replayed: boolean;
  projection_invalidation: 'pending' | 'complete';
  coverage_receipt_digest?: Digest;
};

/**
 * M6 Public Error Code Union: all 27 neutral `MemoryErrorCode` values plus the
 * 4 MCP/Sentropic codes (`RESULT_TOO_LARGE`, `RATE_LIMITED`,
 * `MUTATION_OUTCOME_UNKNOWN`, `gate_failed`).
 */
export type AdditionalPublicMemoryErrorCode =
  | 'RESULT_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'MUTATION_OUTCOME_UNKNOWN'
  | 'gate_failed';

export type PublicMemoryErrorCode =
  | MemoryErrorCode
  | AdditionalPublicMemoryErrorCode;

/**
 * M2 Sentropic `AppResultEnvelope` specializations for the six synchronous tools.
 */
export type ToolSuccessV1<T> = {
  ok: true;
  output: {
    schema_version: 1;
    value: T;
  };
  auditId: string;
  redactionClass: 'high';
};

export type ToolFailureV1 = {
  ok: false;
  auditId: string;
  redactionClass: 'high';
  error: {
    code: PublicMemoryErrorCode;
    message: string;
    retriable: boolean;
  };
};

export type ToolResultV1<T> = ToolSuccessV1<T> | ToolFailureV1;

export type SearchToolResultV1 = ToolResultV1<SearchPageV1>;
export type GetToolResultV1 = ToolResultV1<MemoryReadPacketV1>;
export type CaptureToolResultV1 = ToolResultV1<CaptureOutputV1>;
export type RequestAdmissionToolResultV1 =
  ToolResultV1<RequestAdmissionOutputV1>;
export type WithdrawToolResultV1 = ToolResultV1<WithdrawOutputV1>;
export type ForgetToolResultV1 = ToolResultV1<ForgetOutputV1>;

/**
 * M2 MCP CallToolResult transport representation:
 * `structuredContent` carries the `AppResultEnvelope` (`ToolResultV1<T>`) and
 * `content[0].text` carries an equivalent JSON text representation;
 * `isError` equals `!ok`.
 */
export interface McpToolCallResponseV1<T> {
  readonly isError: boolean;
  readonly structuredContent: ToolResultV1<T>;
  readonly content: readonly [
    {
      readonly type: 'text';
      readonly text: string;
    },
  ];
}

/**
 * M3 runtime verification of the additive versioned neutral read facets:
 * - `MemoryRecallPortV3`: `{ readonly version: 3; recall(request: RecallRequestV2): Promise<Result<RecallPacketV3>> }`
 * - `MemoryReadPortV1`: `{ readonly version: 1; readCurrent(request: ...): Promise<Result<MemoryReadPacketV1>> }`
 *
 * The adapter MUST require both facets and their explicit version numbers (3 and 1)
 * and MUST NOT fall back to legacy `MemoryPortV2.recall` (`version: 2`).
 */
export interface NeutralReadFacetCandidateBundleV1 {
  readonly recallPort?: unknown;
  readonly readPort?: unknown;
  readonly recall_port?: unknown;
  readonly read_port?: unknown;
}

export interface NeutralReadFacetVerificationResultV1 {
  readonly ok: boolean;
  readonly error_code?: 'CAPABILITY_UNAVAILABLE';
  readonly missing_facets: readonly ('MemoryRecallPortV3' | 'MemoryReadPortV1')[];
}

export function isMemoryRecallPortV3(
  candidate: unknown,
): candidate is MemoryRecallPortV3 {
  if (typeof candidate !== 'object' || candidate === null) {
    return false;
  }
  const obj = candidate as Record<string, unknown>;
  return obj.version === 3 && typeof obj.recall === 'function';
}

export function isMemoryReadPortV1(
  candidate: unknown,
): candidate is MemoryReadPortV1 {
  if (typeof candidate !== 'object' || candidate === null) {
    return false;
  }
  const obj = candidate as Record<string, unknown>;
  return obj.version === 1 && typeof obj.readCurrent === 'function';
}

export function verifyRequiredNeutralReadFacets(
  candidateOrRecallPort: unknown,
  explicitReadPort?: unknown,
): NeutralReadFacetVerificationResultV1 {
  let recallCandidate: unknown;
  let readCandidate: unknown;

  if (explicitReadPort !== undefined) {
    recallCandidate = candidateOrRecallPort;
    readCandidate = explicitReadPort;
  } else if (
    typeof candidateOrRecallPort === 'object' &&
    candidateOrRecallPort !== null
  ) {
    const bundle = candidateOrRecallPort as Record<string, unknown>;
    if (
      'recallPort' in bundle ||
      'readPort' in bundle ||
      'recall_port' in bundle ||
      'read_port' in bundle
    ) {
      recallCandidate = bundle.recallPort ?? bundle.recall_port;
      readCandidate = bundle.readPort ?? bundle.read_port;
    } else {
      recallCandidate = candidateOrRecallPort;
      readCandidate = candidateOrRecallPort;
    }
  }

  const missing: ('MemoryRecallPortV3' | 'MemoryReadPortV1')[] = [];
  if (!isMemoryRecallPortV3(recallCandidate)) {
    missing.push('MemoryRecallPortV3');
  }
  if (!isMemoryReadPortV1(readCandidate)) {
    missing.push('MemoryReadPortV1');
  }

  if (missing.length > 0) {
    return {
      ok: false,
      error_code: 'CAPABILITY_UNAVAILABLE',
      missing_facets: missing,
    };
  }

  return {
    ok: true,
    missing_facets: [],
  };
}

/**
 * M3 Host-managed random pagination handle state and bindings.
 *
 * For 0.20.0, pagination uses bounded host-managed server state indexed by an
 * unpredictable random handle (`handle_id`). The engram adapter MUST NOT
 * generate, retain, or own a pagination signing secret, and MUST NOT expose or
 * accept the engine's raw cursor.
 */
export interface PaginationHandleStateV1 {
  readonly handle_id: OpaqueRef;
  readonly engram_owns_signing_secret: false;
  readonly principal_namespace: OpaqueRef;
  readonly tenant_id: OpaqueRef;
  readonly store_id: OpaqueRef;
  readonly connector_instance_id: OpaqueRef;
  readonly scope_ref: OpaqueRef;
  readonly purpose_ref: OpaqueRef;
  readonly query: string;
  readonly query_digest: Digest;
  readonly limit: number;
  readonly max_packet_bytes: number;
  readonly capability_policy: RecallCapabilityPolicyV1;
  readonly selected_profile: 'offline_lexical_v1' | 'semantic_v1';
  readonly profile_version: string;
  readonly valid_as_of: number;
  readonly system_as_of: Cursor;
  readonly internal_engine_cursor: OpaqueRef;
  readonly policy_id: OpaqueRef;
  readonly policy_version: string;
  readonly authorization_epoch: Cursor;
  readonly storage_epoch: Cursor;
  readonly trust_revocation_epoch: Cursor;
  readonly eligibility_digest: Digest;
  readonly next_record_expiry_at?: Instant;
  readonly issued_at: Instant;
  readonly expires_at: Instant;
}

export type PaginationCursorBindingV1 = PaginationHandleStateV1;
