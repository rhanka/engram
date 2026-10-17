/**
 * MCP-L0 Frozen Tool & Substrate Contracts for Engram Agent Memory.
 *
 * Data-pure TypeScript types and constants defining:
 * - The six public MCP memory tools (`engram_memory_*`)
 * - Neutral V3 recall and V1 point-read contracts
 * - Input/output DTOs and public result envelopes
 * - Hard size/cardinality bounds and pagination cursor bindings
 * - Explicitly excluded internal substrate operations
 */

export const ENGRAM_MEMORY_SCHEMA_VERSION = 'engram.memory/v1' as const;
export type MemorySchemaVersion = typeof ENGRAM_MEMORY_SCHEMA_VERSION;

export type IsoUtcTimestamp = string;
export type DurationMs = number;
export type Sha256Digest = string;
export type OpaqueId = string;
export type ReasonCode = string;

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
 * Internal substrate ports and administrative operations that MUST NOT be
 * exposed as public agent-callable MCP tools in v1.
 */
export const EXCLUDED_INTERNAL_MEMORY_OPERATIONS = [
  'admitCandidate',
  'supersedeRecord',
  'openDispute',
  'resolveDispute',
  'appendEvents',
  'readEvents',
  'verifyChain',
  'runBoundedExport',
  'verifyExportBundle',
  'ingestExportBundle',
  'executeErasure',
  'purgeExpiredTombstones',
  'evaluateConsentForCapture',
  'applyConsentRevocationCascade',
  'verifyEvidenceRefs',
  'getQuarantineRecord',
  'releaseFromQuarantine',
  'discardQuarantinedCandidate',
  'evaluatePromotionEligibility',
  'projectCurrentMarkdown',
] as const;

export type ExcludedInternalMemoryOperation =
  (typeof EXCLUDED_INTERNAL_MEMORY_OPERATIONS)[number];

export const SENSITIVITY_LABELS = [
  'public',
  'internal',
  'confidential',
  'restricted',
] as const;
export type SensitivityLabel = (typeof SENSITIVITY_LABELS)[number];

export const SHARING_POLICIES = [
  'deny',
  'local-only',
  'explicit-export',
] as const;
export type SharingPolicy = (typeof SHARING_POLICIES)[number];

export const RETENTION_OUTCOMES = [
  'retain',
  'make-ineligible',
  'tombstone',
] as const;
export type RetentionOutcome = (typeof RETENTION_OUTCOMES)[number];

export const MEMORY_STATUSES = [
  'candidate',
  'quarantined',
  'admitted',
  'superseded',
  'disputed',
  'withdrawn',
  'expired',
  'tombstoned',
] as const;
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

export const RETRIEVAL_STATUSES = ['admitted', 'disputed'] as const;
export type RetrievalStatus = (typeof RETRIEVAL_STATUSES)[number];

export const MEMORY_KINDS = [
  'preference',
  'fact',
  'procedure',
  'episode-summary',
  'decision-note',
  'constraint',
] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export const SOURCE_CLASSES = [
  'explicit-user-input',
  'verified-artifact',
  'tool-observation',
  'model-inference',
  'imported-bundle',
] as const;
export type SourceClass = (typeof SOURCE_CLASSES)[number];

export const EVIDENCE_MEDIA_TYPES = [
  'text/plain',
  'text/markdown',
  'application/json',
  'application/octet-stream',
] as const;
export type EvidenceMediaType = (typeof EVIDENCE_MEDIA_TYPES)[number];

export const SCOPE_LEVELS = [
  'session',
  'project',
  'workspace',
  'user',
  'global',
] as const;
export type ScopeLevel = (typeof SCOPE_LEVELS)[number];

export const RECALL_STATUS_FILTERS = [
  'admitted-only',
  'admitted-and-disputed',
] as const;
export type RecallStatusFilter = (typeof RECALL_STATUS_FILTERS)[number];

export const REDACTION_STATES = [
  'unredacted',
  'redacted',
  'withheld',
] as const;
export type RedactionState = (typeof REDACTION_STATES)[number];

export const READ_OUTCOMES = [
  'returned',
  'withheld_redacted',
  'withheld_status',
  'not_found',
] as const;
export type ReadOutcome = (typeof READ_OUTCOMES)[number];

export interface ScopeRefV1 {
  readonly schema_version: MemorySchemaVersion;
  readonly tenant_id: OpaqueId;
  readonly workspace_id: OpaqueId;
  readonly project_id: OpaqueId;
  readonly level: ScopeLevel;
  readonly session_id?: OpaqueId;
  readonly user_id?: OpaqueId;
}

export interface PrincipalRefV1 {
  readonly schema_version: MemorySchemaVersion;
  readonly principal_id: OpaqueId;
  readonly principal_kind: 'user' | 'agent' | 'service' | 'system';
  readonly tenant_id: OpaqueId;
  readonly roles: readonly string[];
}

export interface EvidenceCitationV1 {
  readonly schema_version: MemorySchemaVersion;
  readonly citation_id: OpaqueId;
  readonly locator: string;
  readonly digest: Sha256Digest;
  readonly media_type: EvidenceMediaType;
  readonly observed_at_utc: IsoUtcTimestamp;
  readonly byte_range?: {
    readonly start_byte: number;
    readonly end_byte_exclusive: number;
  };
  readonly line_range?: {
    readonly start_line: number;
    readonly end_line_inclusive: number;
  };
  readonly excerpt?: string;
}

export interface SourceProvenanceV1 {
  readonly schema_version: MemorySchemaVersion;
  readonly source_class: SourceClass;
  readonly captured_by: PrincipalRefV1;
  readonly observed_at_utc: IsoUtcTimestamp;
  readonly citations: readonly EvidenceCitationV1[];
  readonly upstream_bundle_id?: OpaqueId;
  readonly external_origin_ref?: string;
}

export interface LifecycleEventAnchorV1 {
  readonly schema_version: MemorySchemaVersion;
  readonly event_anchor_id: OpaqueId;
  readonly anchor_kind:
    | 'capture'
    | 'admission'
    | 'supersession'
    | 'dispute'
    | 'withdrawal'
    | 'expiration'
    | 'erasure'
    | 'consent-revocation'
    | 'import';
  readonly occurred_at_utc: IsoUtcTimestamp;
  readonly actor: PrincipalRefV1;
  readonly correlation_id: OpaqueId;
  readonly causation_event_id?: OpaqueId;
}

export interface MemoryRetentionV1 {
  readonly schema_version: MemorySchemaVersion;
  readonly policy_id: OpaqueId;
  readonly retain_until_utc?: IsoUtcTimestamp;
  readonly review_After_utc?: IsoUtcTimestamp;
  readonly review_after_utc?: IsoUtcTimestamp;
  readonly expiry_outcome: RetentionOutcome;
  readonly legal_hold: boolean;
}

export interface ReconciliationHookV1 {
  readonly schema_version: MemorySchemaVersion;
  readonly strategy: 'manual-only' | 'supersede-by-key' | 'append-distinct';
  readonly conflict_key?: string;
  readonly family_refs: readonly OpaqueId[];
}

export interface AdmissibilityAssessmentV1 {
  readonly schema_version: MemorySchemaVersion;
  readonly policy_id: OpaqueId;
  readonly policy_version: string;
  readonly admissible: boolean;
  readonly confidence_bps: number;
  readonly assessed_at_utc: IsoUtcTimestamp;
  readonly assessed_by: PrincipalRefV1;
  readonly reason_codes: readonly ReasonCode[];
  readonly required_corroboration_count: number;
  readonly observed_corroboration_count: number;
}

export interface RecallQueryV1 {
  readonly schema_version: MemorySchemaVersion;
  readonly query_id: OpaqueId;
  readonly scope_ref: ScopeRefV1;
  readonly query_text: string;
  readonly memory_kinds?: readonly MemoryKind[];
  readonly status_filter: RecallStatusFilter;
  readonly max_results: number;
  readonly now_utc: IsoUtcTimestamp;
}

export interface RecallOrderingV1 {
  readonly primary: 'relevance_score_bps_desc';
  readonly secondary: 'admitted_at_utc_desc';
  readonly tertiary: 'memory_id_asc';
}

/**
 * Neutral V2 redacted record projection (EVOL §7 amendment 2026-10-17).
 * Replaces citation-digest-only projection with redacted citations and
 * structured attributes suitable for bounded agent recall/read.
 */
export interface RedactedMemoryRecordV2 {
  readonly schema_version: MemorySchemaVersion;
  readonly memory_id: OpaqueId;
  readonly scope_ref: ScopeRefV1;
  readonly memory_kind: MemoryKind;
  readonly status: RetrievalStatus;
  readonly summary: string;
  readonly statement?: string;
  readonly structured_attributes?: Readonly<
    Record<string, string | number | boolean | null>
  >;
  readonly content_digest: Sha256Digest;
  readonly sensitivity: SensitivityLabel;
  readonly source_class: SourceClass;
  readonly citations: readonly EvidenceCitationV1[];
  readonly redaction_state: RedactionState;
  readonly redacted_fields: readonly string[];
  readonly admitted_at_utc: IsoUtcTimestamp;
  readonly supersedes_ids: readonly OpaqueId[];
  readonly active_dispute_ids: readonly OpaqueId[];
}

export interface RecallRecordPacketV3 {
  readonly rank: number;
  readonly relevance_score_bps: number;
  readonly record: RedactedMemoryRecordV2;
}

export interface RecallPacketV3 {
  readonly schema_version: MemorySchemaVersion;
  readonly packet_id: OpaqueId;
  readonly query_id: OpaqueId;
  readonly scope_ref: ScopeRefV1;
  readonly status_filter: RecallStatusFilter;
  readonly ordering: RecallOrderingV1;
  readonly generated_at_utc: IsoUtcTimestamp;
  readonly records: readonly RecallRecordPacketV3[];
  readonly withheld_count: number;
}

export interface MemoryRecallPortV3 {
  recallV3(query: RecallQueryV1): Promise<RecallPacketV3>;
}

export interface MemoryReadReceiptV1 {
  readonly memory_id: OpaqueId;
  readonly outcome: ReadOutcome;
  readonly status?: MemoryStatus;
  readonly record?: RedactedMemoryRecordV2;
  readonly reason_codes: readonly ReasonCode[];
}

export interface MemoryReadPacketV1 {
  readonly schema_version: MemorySchemaVersion;
  readonly packet_id: OpaqueId;
  readonly scope_ref: ScopeRefV1;
  readonly generated_at_utc: IsoUtcTimestamp;
  readonly results: readonly MemoryReadReceiptV1[];
}

export interface MemoryReadPortV1 {
  readV1(input: {
    readonly scope_ref: ScopeRefV1;
    readonly memory_ids: readonly OpaqueId[];
    readonly now_utc: IsoUtcTimestamp;
  }): Promise<MemoryReadPacketV1>;
}

/**
 * Runtime facet check for neutral read ports required by MCP-L1/MCP-L2.
 */
export function verifyRequiredNeutralReadFacets(
  candidate: unknown,
): {
  readonly ok: boolean;
  readonly missing_facets: readonly ('recallV3' | 'readV1')[];
} {
  const missing: ('recallV3' | 'readV1')[] = [];
  const obj =
    typeof candidate === 'object' && candidate !== null
      ? (candidate as Record<string, unknown>)
      : {};
  if (typeof obj.recallV3 !== 'function') {
    missing.push('recallV3');
  }
  if (typeof obj.readV1 !== 'function') {
    missing.push('readV1');
  }
  return {
    ok: missing.length === 0,
    missing_facets: missing,
  };
}

/**
 * Frozen numeric & byte bounds from SPEC-memory-mcp-v2.md.
 */
export const MEMORY_MCP_LIMITS = {
  SEARCH_QUERY_TEXT_MIN_CHARS: 1,
  SEARCH_QUERY_TEXT_MAX_CHARS: 2048,
  SEARCH_QUERY_TEXT_MAX_UTF8_BYTES: 2048,
  SEARCH_MEMORY_KINDS_MIN_ITEMS: 1,
  SEARCH_MEMORY_KINDS_MAX_ITEMS: 6,
  SEARCH_LIMIT_MIN: 1,
  SEARCH_LIMIT_MAX: 25,
  SEARCH_LIMIT_DEFAULT: 10,
  SEARCH_CURSOR_MIN_CHARS: 1,
  SEARCH_CURSOR_MAX_CHARS: 512,
  SEARCH_CURSOR_TTL_SECONDS: 300,
  GET_MEMORY_IDS_MIN_ITEMS: 1,
  GET_MEMORY_IDS_MAX_ITEMS: 10,
  OPAQUE_ID_MIN_CHARS: 1,
  OPAQUE_ID_MAX_CHARS: 128,
  CAPTURE_SUMMARY_MIN_CHARS: 1,
  CAPTURE_SUMMARY_MAX_CHARS: 512,
  CAPTURE_SUMMARY_MAX_UTF8_BYTES: 512,
  CAPTURE_STATEMENT_MIN_CHARS: 1,
  CAPTURE_STATEMENT_MAX_CHARS: 8192,
  CAPTURE_STATEMENT_MAX_UTF8_BYTES: 8192,
  CAPTURE_STRUCTURED_ATTR_MAX_KEYS: 32,
  CAPTURE_STRUCTURED_ATTR_KEY_MIN_CHARS: 1,
  CAPTURE_STRUCTURED_ATTR_KEY_MAX_CHARS: 64,
  CAPTURE_STRUCTURED_ATTR_STRING_MAX_UTF8_BYTES: 512,
  CAPTURE_STRUCTURED_ATTR_MAX_UTF8_BYTES: 4096,
  CAPTURE_CITATIONS_MIN_ITEMS: 1,
  CAPTURE_CITATIONS_MAX_ITEMS: 16,
  CITATION_LOCATOR_MIN_CHARS: 1,
  CITATION_LOCATOR_MAX_CHARS: 512,
  CITATION_EXCERPT_MAX_CHARS: 512,
  CITATION_EXCERPT_MAX_UTF8_BYTES: 512,
  RECONCILIATION_FAMILY_REFS_MIN_ITEMS: 1,
  RECONCILIATION_FAMILY_REFS_MAX_ITEMS: 8,
  MAX_SERIALIZED_RESPONSE_UTF8_BYTES: 65536,
  MAX_INVOCATION_DEADLINE_MS: 30000,
  CONFIRMATION_TOKEN_TTL_SECONDS: 300,
  DEFAULT_RETENTION_CEILING_DAYS: 90,
  MAX_RETENTION_CEILING_DAYS: 365,
} as const;

export interface SearchInputV1 {
  readonly query_text: string;
  readonly memory_kinds?: readonly MemoryKind[];
  readonly status_filter?: RecallStatusFilter;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface SearchPageV1 {
  readonly returned_count: number;
  readonly has_more: boolean;
  readonly next_cursor?: string;
}

export type SearchOutputV1 = RecallPacketV3 & {
  readonly page: SearchPageV1;
};

export interface GetInputV1 {
  readonly memory_ids: readonly OpaqueId[];
}

export type GetOutputV1 = MemoryReadPacketV1;

export interface CapturePayloadInputV1 {
  readonly summary: string;
  readonly statement: string;
  readonly structured_attributes?: Readonly<
    Record<string, string | number | boolean | null>
  >;
}

export interface CaptureRetentionHintV1 {
  readonly expires_at_utc?: IsoUtcTimestamp;
  readonly expiry_outcome?: RetentionOutcome;
}

export interface CaptureReconciliationHintV1 {
  readonly family_refs: readonly OpaqueId[];
}

export interface CaptureInputV1 {
  readonly idempotency_key: string;
  readonly memory_kind: MemoryKind;
  readonly payload: CapturePayloadInputV1;
  readonly provenance: SourceProvenanceV1;
  readonly sensitivity?: SensitivityLabel;
  readonly sharing_policy?: SharingPolicy;
  readonly retention_hint?: CaptureRetentionHintV1;
  readonly reconciliation_hint?: CaptureReconciliationHintV1;
}

export interface CaptureOutputV1 {
  readonly schema_version: MemorySchemaVersion;
  readonly memory_id: OpaqueId;
  readonly status: 'candidate' | 'quarantined';
  readonly content_digest: Sha256Digest;
  readonly captured_at_utc: IsoUtcTimestamp;
  readonly event_id: OpaqueId;
  readonly idempotent_replay: boolean;
  readonly quarantine_reason_codes?: readonly ReasonCode[];
}

export interface RequestAdmissionInputV1 {
  readonly idempotency_key: string;
  readonly memory_id: OpaqueId;
  readonly rationale_code: ReasonCode;
}

export interface RequestAdmissionOutputV1 {
  readonly schema_version: MemorySchemaVersion;
  readonly memory_id: OpaqueId;
  readonly outcome: 'admitted' | 'quarantined' | 'rejected';
  readonly resulting_status: 'admitted' | 'quarantined' | 'candidate';
  readonly decided_at_utc: IsoUtcTimestamp;
  readonly assessment: AdmissibilityAssessmentV1;
  readonly idempotent_replay: boolean;
  readonly event_id?: OpaqueId;
}

export interface WithdrawInputV1 {
  readonly idempotency_key: string;
  readonly memory_id: OpaqueId;
  readonly reason_code: ReasonCode;
}

export interface WithdrawOutputV1 {
  readonly schema_version: MemorySchemaVersion;
  readonly memory_id: OpaqueId;
  readonly previous_status:
    | 'candidate'
    | 'quarantined'
    | 'admitted'
    | 'disputed';
  readonly status: 'withdrawn';
  readonly withdrawn_at_utc: IsoUtcTimestamp;
  readonly event_id: OpaqueId;
  readonly idempotent_replay: boolean;
}

export interface ForgetInputV1 {
  readonly idempotency_key: string;
  readonly memory_id: OpaqueId;
  readonly reason_code: ReasonCode;
}

export interface ForgetOutputV1 {
  readonly schema_version: MemorySchemaVersion;
  readonly memory_id: OpaqueId;
  readonly tombstone_id: OpaqueId;
  readonly erased_at_utc: IsoUtcTimestamp;
  readonly event_id: OpaqueId;
  readonly erased_artifact_digests: readonly Sha256Digest[];
  readonly destroyed_key_ids: readonly OpaqueId[];
  readonly idempotent_replay: boolean;
}

export type PublicMemoryErrorCode =
  | 'INVALID_SCHEMA'
  | 'UNSUPPORTED_SCHEMA_VERSION'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_DIGEST'
  | 'SCOPE_VIOLATION'
  | 'UNAUTHORIZED_PRINCIPAL'
  | 'CONSENT_DENIED'
  | 'CONSENT_REVOKED'
  | 'SHARING_POLICY_DENIED'
  | 'QUOTA_EXCEEDED'
  | 'NOT_FOUND'
  | 'DUPLICATE_ID'
  | 'IDEMPOTENCY_CONFLICT'
  | 'CONCURRENCY_CONFLICT'
  | 'ILLEGAL_TRANSITION'
  | 'ALREADY_TERMINAL'
  | 'LEGAL_HOLD_ACTIVE'
  | 'EVIDENCE_UNVERIFIED'
  | 'EVIDENCE_DIGEST_MISMATCH'
  | 'ADMISSION_REJECTED'
  | 'QUARANTINED'
  | 'HASH_CHAIN_BROKEN'
  | 'SIGNATURE_INVALID'
  | 'BUNDLE_INTEGRITY_FAILED'
  | 'ERASURE_INCOMPLETE'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'STORAGE_IO_ERROR'
  | 'RESULT_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'MUTATION_OUTCOME_UNKNOWN'
  | 'gate_failed';

export interface ToolSuccessV1<T> {
  readonly ok: true;
  readonly schema_version: MemorySchemaVersion;
  readonly tool: EngramMemoryToolName;
  readonly result: T;
}

export interface ToolFailureV1 {
  readonly ok: false;
  readonly schema_version: MemorySchemaVersion;
  readonly tool: EngramMemoryToolName;
  readonly error: {
    readonly code: PublicMemoryErrorCode;
    readonly message: string;
    readonly retryable: boolean;
    readonly details?: Readonly<
      Record<string, string | number | boolean | null>
    >;
  };
}

export type ToolResultV1<T> = ToolSuccessV1<T> | ToolFailureV1;

export type SearchToolResultV1 = ToolResultV1<SearchOutputV1>;
export type GetToolResultV1 = ToolResultV1<GetOutputV1>;
export type CaptureToolResultV1 = ToolResultV1<CaptureOutputV1>;
export type RequestAdmissionToolResultV1 =
  ToolResultV1<RequestAdmissionOutputV1>;
export type WithdrawToolResultV1 = ToolResultV1<WithdrawOutputV1>;
export type ForgetToolResultV1 = ToolResultV1<ForgetOutputV1>;

/**
 * Standard MCP CallToolResult transport representation for Engram memory tools.
 * Both `structuredContent` and the single JSON text block in `content` carry
 * the identical `ToolResultV1<T>` payload; `isError === !result.ok`.
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
 * Cryptographic/authenticated binding contract for `engram_memory_search`
 * pagination cursors. A cursor is rejected with `INVALID_SCHEMA` (`cursor`)
 * if any bound parameter differs or if `now_utc > expires_at_utc`.
 */
export interface PaginationCursorBindingV1 {
  readonly scope_ref: ScopeRefV1;
  readonly query_digest: Sha256Digest;
  readonly status_filter: RecallStatusFilter;
  readonly memory_kinds: readonly MemoryKind[];
  readonly ordering: RecallOrderingV1;
  readonly snapshot_watermark: string;
  readonly issued_at_utc: IsoUtcTimestamp;
  readonly expires_at_utc: IsoUtcTimestamp;
  readonly offset: number;
}
