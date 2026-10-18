/**
 * MCP-L0 Closed JSON Schemas and Deterministic Validators for Engram Memory Tools.
 *
 * Normative alignment with SPEC-memory-mcp-v2.md (M2, M3, M5, M6) and
 * `engram-memory/contracts` + `engram-memory/schemas`:
 * - Reuses `CANDIDATE_PAYLOAD_V2_SCHEMA`, `MEMORY_RECORD_V2_SCHEMA`, and
 *   `REDACTED_MEMORY_RECORD_V2_SCHEMA` directly from `engram-memory/schemas`.
 * - Closed M2 input schemas (`SearchInputV1`, `GetInputV1`, `CaptureInputV1`,
 *   `RequestAdmissionInputV1`, `WithdrawInputV1`, `ForgetInputV1`) with
 *   `additionalProperties: false` at every object boundary.
 * - Closed Sentropic `AppResultEnvelope` output schemas (`ToolSuccessV1<T>`,
 *   `ToolFailureV1`).
 * - NFC normalization, UTF-8 byte bounds, RFC 3339 millisecond UTC `Instant`,
 *   `sha256:<64 lowercase hex>` `Digest`, canonical decimal u64 `Cursor`, and
 *   host-managed random pagination handle validation (`STALE_PAGE`).
 */

import {
  CANDIDATE_PAYLOAD_V2_SCHEMA,
  MEMORY_RECORD_V2_SCHEMA,
  REDACTED_MEMORY_RECORD_V2_SCHEMA,
} from '../../../engram-memory/dist/schemas.js';
import {
  DISCLOSABLE_MEMORY_STATES,
  ENGRAM_MEMORY_CANDIDATE_SCHEMA_VERSION,
  ENGRAM_MEMORY_STRUCTURED_OUTPUT_SCHEMA_VERSION,
  ENGRAM_MEMORY_TOOL_NAMES,
  MEMORY_MCP_LIMITS,
  TOMBSTONE_ALLOWED_FROM_STATES,
  type AdmissionOutcomeV1,
  type CaptureInputV1,
  type CaptureOutputV1,
  type CapturePayloadInputV1,
  type CitationV1,
  type Cursor,
  type Digest,
  type EngramMemoryToolName,
  type EvidenceBundleV1,
  type ForgetInputV1,
  type ForgetOutputV1,
  type GetInputV1,
  type GetOutputV1,
  type IdempotencyKey,
  type Instant,
  type JsonPointer,
  type LifecycleReceiptV1,
  type McpToolCallResponseV1,
  type MemoryComponentV2,
  type MemoryReadPacketV1,
  type MemoryReadReceiptV1,
  type OpaqueRef,
  type PaginationCursorBindingV1,
  type PaginationHandleStateV1,
  type PublicMemoryErrorCode,
  type RankReceiptV1,
  type RecallCapabilityPolicyV1,
  type RecallRecordPacketV3,
  type RedactedMemoryRecordV2,
  type RequestAdmissionInputV1,
  type RequestAdmissionOutputV1,
  type SearchInputV1,
  type SearchOutputV1,
  type SearchPageV1,
  type ToolResultV1,
  type TrustBindingV1,
  type WithdrawInputV1,
  type WithdrawOutputV1,
} from './contracts.js';
import { PUBLIC_MEMORY_ERROR_CODES } from './errors.js';

export {
  CANDIDATE_PAYLOAD_V2_SCHEMA,
  MEMORY_RECORD_V2_SCHEMA,
  PUBLIC_MEMORY_ERROR_CODES,
  REDACTED_MEMORY_RECORD_V2_SCHEMA,
};

export const REDACTED_MEMORY_RECORD_V2_JSON_SCHEMA =
  REDACTED_MEMORY_RECORD_V2_SCHEMA;

const INSTANT_MS_UTC_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SHA256_DIGEST_REGEX = /^sha256:[0-9a-f]{64}$/;
const RECORD_ID_REGEX = /^mem_[a-z2-7]+$/;
const CURSOR_U64_REGEX = /^(0|[1-9][0-9]*)$/;
const MAX_U64 = 18_446_744_073_709_551_615n;

const OPAQUE_REF_SCHEMA = {
  type: 'string',
  minLength: MEMORY_MCP_LIMITS.OPAQUE_REF_MIN_UTF8_BYTES,
  maxLength: MEMORY_MCP_LIMITS.OPAQUE_REF_MAX_UTF8_BYTES,
} as const;

const RECORD_ID_SCHEMA = {
  type: 'string',
  minLength: MEMORY_MCP_LIMITS.OPAQUE_REF_MIN_UTF8_BYTES,
  maxLength: MEMORY_MCP_LIMITS.OPAQUE_REF_MAX_UTF8_BYTES,
  pattern: MEMORY_MCP_LIMITS.RECORD_ID_PATTERN,
} as const;

const IDEMPOTENCY_KEY_SCHEMA = {
  type: 'string',
  minLength: MEMORY_MCP_LIMITS.IDEMPOTENCY_KEY_SCHEMA_MIN_LENGTH,
  maxLength: MEMORY_MCP_LIMITS.IDEMPOTENCY_KEY_SCHEMA_MAX_LENGTH,
} as const;

const DIGEST_SCHEMA = {
  type: 'string',
  pattern: MEMORY_MCP_LIMITS.DIGEST_PATTERN,
} as const;

const INSTANT_SCHEMA = {
  type: 'string',
  pattern: MEMORY_MCP_LIMITS.INSTANT_PATTERN,
} as const;

const CURSOR_SCHEMA = {
  type: 'string',
  pattern: MEMORY_MCP_LIMITS.CURSOR_PATTERN,
} as const;

const JSON_POINTER_SCHEMA = {
  type: 'string',
  pattern: '^(/([^/~]|~[01])*)*$',
} as const;

export const RECALL_CAPABILITY_POLICY_V1_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['minimum_channels', 'network'],
  properties: {
    minimum_channels: { enum: ['lexical', 'lexical_and_semantic'] },
    network: { enum: ['forbid', 'allow'] },
  },
} as const;

export const CITATION_LOCATOR_V1_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['scheme', 'value'],
  properties: {
    scheme: {
      type: 'string',
      minLength: MEMORY_MCP_LIMITS.CITATION_LOCATOR_SCHEME_MIN_UTF8_BYTES,
      maxLength: MEMORY_MCP_LIMITS.CITATION_LOCATOR_SCHEME_MAX_UTF8_BYTES,
    },
    value: {
      type: 'string',
      minLength: MEMORY_MCP_LIMITS.CITATION_LOCATOR_VALUE_MIN_UTF8_BYTES,
      maxLength: MEMORY_MCP_LIMITS.CITATION_LOCATOR_VALUE_MAX_UTF8_BYTES,
    },
  },
} as const;

export const CITATION_V1_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['citation_id', 'source_ref', 'locator', 'content_digest'],
  properties: {
    citation_id: OPAQUE_REF_SCHEMA,
    source_ref: OPAQUE_REF_SCHEMA,
    locator: CITATION_LOCATOR_V1_SCHEMA,
    content_digest: DIGEST_SCHEMA,
    observed_at: INSTANT_SCHEMA,
  },
} as const;

export const MEMORY_COMPONENT_V2_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['component_id', 'kind', 'text', 'citation_ids'],
  properties: {
    component_id: OPAQUE_REF_SCHEMA,
    kind: { enum: ['context', 'decision', 'evidence'] },
    text: {
      type: 'string',
      minLength: MEMORY_MCP_LIMITS.COMPONENT_TEXT_MIN_UTF8_BYTES,
      maxLength: MEMORY_MCP_LIMITS.COMPONENT_TEXT_MAX_UTF8_BYTES,
    },
    citation_ids: {
      type: 'array',
      minItems: 1,
      maxItems: MEMORY_MCP_LIMITS.CITATIONS_MAX_ITEMS,
      uniqueItems: true,
      items: OPAQUE_REF_SCHEMA,
    },
  },
} as const;

export const RETENTION_V1_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['derivative_rule'],
  properties: {
    expires_at: INSTANT_SCHEMA,
    derivative_rule: { enum: ['retain', 'make-ineligible'] },
  },
} as const;

export const RECONCILIATION_CONSENT_V1_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['family_refs'],
  properties: {
    family_refs: {
      type: 'array',
      minItems: MEMORY_MCP_LIMITS.RECONCILIATION_FAMILY_REFS_MIN_ITEMS,
      maxItems: MEMORY_MCP_LIMITS.RECONCILIATION_FAMILY_REFS_MAX_ITEMS,
      uniqueItems: true,
      items: OPAQUE_REF_SCHEMA,
    },
  },
} as const;

/**
 * M2 Closed Input JSON Schemas (aligned with SPEC-memory-mcp-v3.1.md §M2 and
 * `engram-memory/validation.ts:89–102,139–220`).
 */
export const ENGRAM_MEMORY_SEARCH_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['query', 'purpose_ref'],
  properties: {
    query: {
      type: 'string',
      minLength: MEMORY_MCP_LIMITS.QUERY_MIN_UTF8_BYTES,
      maxLength: MEMORY_MCP_LIMITS.QUERY_MAX_UTF8_BYTES,
    },
    purpose_ref: OPAQUE_REF_SCHEMA,
    limit: {
      type: 'integer',
      minimum: MEMORY_MCP_LIMITS.LIMIT_MIN,
      maximum: MEMORY_MCP_LIMITS.LIMIT_MAX,
      default: MEMORY_MCP_LIMITS.LIMIT_DEFAULT,
    },
    max_packet_bytes: {
      type: 'integer',
      minimum: MEMORY_MCP_LIMITS.MAX_PACKET_BYTES_MIN,
      maximum: MEMORY_MCP_LIMITS.MAX_PACKET_BYTES_MAX,
      default: MEMORY_MCP_LIMITS.MAX_PACKET_BYTES_DEFAULT,
    },
    capability_policy: RECALL_CAPABILITY_POLICY_V1_SCHEMA,
    page_cursor: OPAQUE_REF_SCHEMA,
  },
} as const;

export const ENGRAM_MEMORY_GET_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['record_id', 'purpose_ref'],
  properties: {
    record_id: RECORD_ID_SCHEMA,
    purpose_ref: OPAQUE_REF_SCHEMA,
    max_packet_bytes: {
      type: 'integer',
      minimum: MEMORY_MCP_LIMITS.MAX_PACKET_BYTES_MIN,
      maximum: MEMORY_MCP_LIMITS.MAX_PACKET_BYTES_MAX,
      default: MEMORY_MCP_LIMITS.MAX_PACKET_BYTES_DEFAULT,
    },
  },
} as const;

export const ENGRAM_MEMORY_CAPTURE_PAYLOAD_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'schema_version',
    'purpose_ref',
    'valid_time',
    'components',
    'primary_component_id',
    'primary_event',
    'citations',
  ],
  properties: {
    schema_version: CANDIDATE_PAYLOAD_V2_SCHEMA.properties.schema_version,
    purpose_ref: OPAQUE_REF_SCHEMA,
    valid_time: CANDIDATE_PAYLOAD_V2_SCHEMA.properties.valid_time,
    components: {
      type: 'array',
      minItems: MEMORY_MCP_LIMITS.COMPONENTS_MIN_ITEMS,
      maxItems: MEMORY_MCP_LIMITS.COMPONENTS_MAX_ITEMS,
      items: MEMORY_COMPONENT_V2_SCHEMA,
    },
    primary_component_id: OPAQUE_REF_SCHEMA,
    primary_event: CANDIDATE_PAYLOAD_V2_SCHEMA.properties.primary_event,
    citations: {
      type: 'array',
      minItems: MEMORY_MCP_LIMITS.CITATIONS_MIN_ITEMS,
      maxItems: MEMORY_MCP_LIMITS.CITATIONS_MAX_ITEMS,
      items: CITATION_V1_SCHEMA,
    },
    retention: RETENTION_V1_SCHEMA,
    reconciliation: RECONCILIATION_CONSENT_V1_SCHEMA,
  },
} as const;

export const EVIDENCE_BUNDLE_V1_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['evidence_ref', 'evidence_digest', 'citation_ids'],
  properties: {
    evidence_ref: OPAQUE_REF_SCHEMA,
    evidence_digest: DIGEST_SCHEMA,
    citation_ids: {
      type: 'array',
      minItems: 1,
      maxItems: MEMORY_MCP_LIMITS.CITATIONS_MAX_ITEMS,
      uniqueItems: true,
      items: OPAQUE_REF_SCHEMA,
    },
    attestation: { type: 'string', minLength: 1, maxLength: 4096 },
  },
} as const;

export const ENGRAM_MEMORY_CAPTURE_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['idempotency_key', 'payload', 'evidence'],
  properties: {
    idempotency_key: IDEMPOTENCY_KEY_SCHEMA,
    payload: ENGRAM_MEMORY_CAPTURE_PAYLOAD_INPUT_SCHEMA,
    evidence: EVIDENCE_BUNDLE_V1_SCHEMA,
  },
} as const;

export const ENGRAM_MEMORY_REQUEST_ADMISSION_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['candidate_id', 'idempotency_key'],
  properties: {
    candidate_id: OPAQUE_REF_SCHEMA,
    idempotency_key: IDEMPOTENCY_KEY_SCHEMA,
  },
} as const;

export const ENGRAM_MEMORY_WITHDRAW_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['candidate_id', 'idempotency_key', 'reason_ref'],
  properties: {
    candidate_id: OPAQUE_REF_SCHEMA,
    idempotency_key: IDEMPOTENCY_KEY_SCHEMA,
    reason_ref: OPAQUE_REF_SCHEMA,
  },
} as const;

export const ENGRAM_MEMORY_FORGET_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['record_id', 'idempotency_key', 'reason_ref'],
  properties: {
    record_id: RECORD_ID_SCHEMA,
    idempotency_key: IDEMPOTENCY_KEY_SCHEMA,
    reason_ref: OPAQUE_REF_SCHEMA,
  },
} as const;

/**
 * Neutral V3/V1 Read & Lifecycle Companion Schemas (`RecallRecordPacketV3`,
 * `RankReceiptV1`, `MemoryReadReceiptV1`, `MemoryReadPacketV1`,
 * `AdmissionOutcomeV1`, `LifecycleReceiptV1`).
 */
export const RANK_RECEIPT_V1_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'request_digest',
    'authorization_receipt_digest',
    'profile',
    'profile_version',
    'profile_config_digest',
    'valid_as_of',
    'system_as_of',
    'snapshot_id',
    'snapshot_digest',
    'candidate_count',
    'candidate_ids_digest',
    'scoring_formula_ref',
    'ordered_ids_digest',
    'revalidation_receipt_digest',
    'projection_receipt_digests',
    'issued_at',
    'receipt_digest',
  ],
  properties: {
    request_digest: DIGEST_SCHEMA,
    authorization_receipt_digest: DIGEST_SCHEMA,
    profile: { enum: ['offline_lexical_v1', 'semantic_v1'] },
    profile_version: OPAQUE_REF_SCHEMA,
    profile_config_digest: DIGEST_SCHEMA,
    valid_as_of: { type: 'integer' },
    system_as_of: CURSOR_SCHEMA,
    snapshot_id: OPAQUE_REF_SCHEMA,
    snapshot_digest: DIGEST_SCHEMA,
    candidate_count: { type: 'integer', minimum: 0 },
    candidate_ids_digest: DIGEST_SCHEMA,
    scoring_formula_ref: OPAQUE_REF_SCHEMA,
    ordered_ids_digest: DIGEST_SCHEMA,
    revalidation_receipt_digest: DIGEST_SCHEMA,
    projection_receipt_digests: {
      type: 'array',
      items: DIGEST_SCHEMA,
    },
    issued_at: INSTANT_SCHEMA,
    receipt_digest: DIGEST_SCHEMA,
  },
} as const;

export const RECALL_RECORD_PACKET_V3_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'record',
    'redacted_fields',
    'redaction_receipt_digest',
    'score',
    'rank',
  ],
  properties: {
    record: REDACTED_MEMORY_RECORD_V2_SCHEMA,
    redacted_fields: {
      type: 'array',
      items: JSON_POINTER_SCHEMA,
    },
    redaction_receipt_digest: DIGEST_SCHEMA,
    score: { type: 'number' },
    rank: { type: 'integer', minimum: 1 },
  },
} as const;

export const RECALL_PACKET_V3_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['records', 'rank_receipt', 'packet_digest'],
  properties: {
    records: {
      type: 'array',
      maxItems: MEMORY_MCP_LIMITS.LIMIT_MAX,
      items: RECALL_RECORD_PACKET_V3_SCHEMA,
    },
    rank_receipt: RANK_RECEIPT_V1_SCHEMA,
    next_page_cursor: OPAQUE_REF_SCHEMA,
    packet_digest: DIGEST_SCHEMA,
  },
} as const;

export const MEMORY_READ_RECEIPT_V1_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'record_id',
    'record_digest',
    'valid_as_of',
    'system_as_of',
    'validated_through_cursor',
    'authorization_receipt_digest',
    'revalidation_receipt_digest',
    'checked_at',
    'receipt_digest',
  ],
  properties: {
    record_id: RECORD_ID_SCHEMA,
    record_digest: DIGEST_SCHEMA,
    valid_as_of: { type: 'integer' },
    system_as_of: CURSOR_SCHEMA,
    validated_through_cursor: CURSOR_SCHEMA,
    authorization_receipt_digest: DIGEST_SCHEMA,
    revalidation_receipt_digest: DIGEST_SCHEMA,
    checked_at: INSTANT_SCHEMA,
    receipt_digest: DIGEST_SCHEMA,
  },
} as const;

export const MEMORY_READ_PACKET_V1_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'record',
    'redacted_fields',
    'redaction_receipt_digest',
    'read_receipt',
    'packet_digest',
  ],
  properties: {
    record: REDACTED_MEMORY_RECORD_V2_SCHEMA,
    redacted_fields: {
      type: 'array',
      items: JSON_POINTER_SCHEMA,
    },
    redaction_receipt_digest: DIGEST_SCHEMA,
    read_receipt: MEMORY_READ_RECEIPT_V1_SCHEMA,
    packet_digest: DIGEST_SCHEMA,
  },
} as const;

export const ADMISSION_OUTCOME_V1_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'status',
    'candidate_id',
    'cursor',
    'decision_receipt_digest',
    'transaction_receipt_digest',
  ],
  properties: {
    status: {
      enum: [
        'accepted',
        'rejected',
        'pending_adjudication',
        'duplicate_exact',
      ],
    },
    candidate_id: OPAQUE_REF_SCHEMA,
    record_id: RECORD_ID_SCHEMA,
    cursor: CURSOR_SCHEMA,
    decision_receipt_digest: DIGEST_SCHEMA,
    transaction_receipt_digest: DIGEST_SCHEMA,
  },
} as const;

export const LIFECYCLE_RECEIPT_V1_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'event_id',
    'operation',
    'from_state',
    'to_state',
    'cursor',
    'event_digest',
    'authorization_receipt_digest',
    'transaction_receipt_digest',
  ],
  properties: {
    event_id: IDEMPOTENCY_KEY_SCHEMA,
    operation: { enum: ['withdraw', 'tombstone'] },
    from_state: {
      enum: [
        'pending',
        'accepted_current',
        'accepted_disputed',
        'historical',
        'expired',
        'trust_invalid',
      ],
    },
    to_state: { enum: ['withdrawn', 'tombstoned'] },
    cursor: CURSOR_SCHEMA,
    event_digest: DIGEST_SCHEMA,
    authorization_receipt_digest: DIGEST_SCHEMA,
    transaction_receipt_digest: DIGEST_SCHEMA,
  },
} as const;

/**
 * M2 Result Payload JSON Schemas.
 */
export const SEARCH_RESULT_PAYLOAD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['records', 'rank_receipt', 'response_digest'],
  properties: {
    records: {
      type: 'array',
      maxItems: MEMORY_MCP_LIMITS.LIMIT_MAX,
      items: RECALL_RECORD_PACKET_V3_SCHEMA,
    },
    rank_receipt: RANK_RECEIPT_V1_SCHEMA,
    next_page_cursor: OPAQUE_REF_SCHEMA,
    response_digest: DIGEST_SCHEMA,
  },
} as const;

export const GET_RESULT_PAYLOAD_SCHEMA = MEMORY_READ_PACKET_V1_SCHEMA;

export const CAPTURE_RESULT_PAYLOAD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'status',
    'candidate_id',
    'cursor',
    'transaction_receipt_digest',
  ],
  properties: {
    status: { enum: ['committed_pending', 'duplicate_exact'] },
    candidate_id: OPAQUE_REF_SCHEMA,
    record_digest: DIGEST_SCHEMA,
    cursor: CURSOR_SCHEMA,
    transaction_receipt_digest: DIGEST_SCHEMA,
  },
} as const;

export const REQUEST_ADMISSION_RESULT_PAYLOAD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['outcome', 'replayed'],
  properties: {
    outcome: ADMISSION_OUTCOME_V1_SCHEMA,
    replayed: { type: 'boolean' },
  },
} as const;

export const WITHDRAW_LIFECYCLE_RECEIPT_V1_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'event_id',
    'operation',
    'from_state',
    'to_state',
    'cursor',
    'event_digest',
    'authorization_receipt_digest',
    'transaction_receipt_digest',
  ],
  properties: {
    event_id: IDEMPOTENCY_KEY_SCHEMA,
    operation: { const: 'withdraw' },
    from_state: { const: 'pending' },
    to_state: { const: 'withdrawn' },
    cursor: CURSOR_SCHEMA,
    event_digest: DIGEST_SCHEMA,
    authorization_receipt_digest: DIGEST_SCHEMA,
    transaction_receipt_digest: DIGEST_SCHEMA,
  },
} as const;

export const WITHDRAW_RESULT_PAYLOAD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['receipt', 'replayed', 'key_destruction'],
  properties: {
    receipt: WITHDRAW_LIFECYCLE_RECEIPT_V1_SCHEMA,
    replayed: { type: 'boolean' },
    key_destruction: { enum: ['pending', 'complete'] },
  },
} as const;

export const FORGET_LIFECYCLE_RECEIPT_V1_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'event_id',
    'operation',
    'from_state',
    'to_state',
    'cursor',
    'event_digest',
    'authorization_receipt_digest',
    'transaction_receipt_digest',
  ],
  properties: {
    event_id: IDEMPOTENCY_KEY_SCHEMA,
    operation: { const: 'tombstone' },
    from_state: { enum: [...TOMBSTONE_ALLOWED_FROM_STATES] },
    to_state: { const: 'tombstoned' },
    cursor: CURSOR_SCHEMA,
    event_digest: DIGEST_SCHEMA,
    authorization_receipt_digest: DIGEST_SCHEMA,
    transaction_receipt_digest: DIGEST_SCHEMA,
  },
} as const;

export const FORGET_RESULT_PAYLOAD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['receipt', 'replayed', 'projection_invalidation'],
  properties: {
    receipt: FORGET_LIFECYCLE_RECEIPT_V1_SCHEMA,
    replayed: { type: 'boolean' },
    projection_invalidation: { enum: ['pending', 'complete'] },
    coverage_receipt_digest: DIGEST_SCHEMA,
  },
} as const;

/**
 * M2 Sentropic `AppResultEnvelope` schema builder.
 */
function buildToolResultEnvelopeSchema(valueSchema: Record<string, unknown>) {
  return {
    oneOf: [
      {
        type: 'object',
        additionalProperties: false,
        required: ['ok', 'output', 'auditId', 'redactionClass'],
        properties: {
          ok: { const: true },
          output: {
            type: 'object',
            additionalProperties: false,
            required: ['schema_version', 'value'],
            properties: {
              schema_version: {
                const: ENGRAM_MEMORY_STRUCTURED_OUTPUT_SCHEMA_VERSION,
              },
              value: valueSchema,
            },
          },
          auditId: OPAQUE_REF_SCHEMA,
          redactionClass: { const: 'high' },
        },
      },
      {
        type: 'object',
        additionalProperties: false,
        required: ['ok', 'auditId', 'redactionClass', 'error'],
        properties: {
          ok: { const: false },
          auditId: OPAQUE_REF_SCHEMA,
          redactionClass: { const: 'high' },
          error: {
            type: 'object',
            additionalProperties: false,
            required: ['code', 'message', 'retriable'],
            properties: {
              code: { enum: [...PUBLIC_MEMORY_ERROR_CODES] },
              message: { type: 'string', minLength: 1, maxLength: 1024 },
              retriable: { type: 'boolean' },
            },
          },
        },
      },
    ],
  } as const;
}

export const ENGRAM_MEMORY_SEARCH_OUTPUT_SCHEMA = buildToolResultEnvelopeSchema(
  SEARCH_RESULT_PAYLOAD_SCHEMA,
);
export const ENGRAM_MEMORY_GET_OUTPUT_SCHEMA = buildToolResultEnvelopeSchema(
  GET_RESULT_PAYLOAD_SCHEMA,
);
export const ENGRAM_MEMORY_CAPTURE_OUTPUT_SCHEMA =
  buildToolResultEnvelopeSchema(CAPTURE_RESULT_PAYLOAD_SCHEMA);
export const ENGRAM_MEMORY_REQUEST_ADMISSION_OUTPUT_SCHEMA =
  buildToolResultEnvelopeSchema(REQUEST_ADMISSION_RESULT_PAYLOAD_SCHEMA);
export const ENGRAM_MEMORY_WITHDRAW_OUTPUT_SCHEMA =
  buildToolResultEnvelopeSchema(WITHDRAW_RESULT_PAYLOAD_SCHEMA);
export const ENGRAM_MEMORY_FORGET_OUTPUT_SCHEMA = buildToolResultEnvelopeSchema(
  FORGET_RESULT_PAYLOAD_SCHEMA,
);

export const ENGRAM_MEMORY_TOOL_SCHEMAS = {
  engram_memory_search: {
    name: 'engram_memory_search',
    inputSchema: ENGRAM_MEMORY_SEARCH_INPUT_SCHEMA,
    outputSchema: ENGRAM_MEMORY_SEARCH_OUTPUT_SCHEMA,
  },
  engram_memory_get: {
    name: 'engram_memory_get',
    inputSchema: ENGRAM_MEMORY_GET_INPUT_SCHEMA,
    outputSchema: ENGRAM_MEMORY_GET_OUTPUT_SCHEMA,
  },
  engram_memory_capture: {
    name: 'engram_memory_capture',
    inputSchema: ENGRAM_MEMORY_CAPTURE_INPUT_SCHEMA,
    outputSchema: ENGRAM_MEMORY_CAPTURE_OUTPUT_SCHEMA,
  },
  engram_memory_request_admission: {
    name: 'engram_memory_request_admission',
    inputSchema: ENGRAM_MEMORY_REQUEST_ADMISSION_INPUT_SCHEMA,
    outputSchema: ENGRAM_MEMORY_REQUEST_ADMISSION_OUTPUT_SCHEMA,
  },
  engram_memory_withdraw: {
    name: 'engram_memory_withdraw',
    inputSchema: ENGRAM_MEMORY_WITHDRAW_INPUT_SCHEMA,
    outputSchema: ENGRAM_MEMORY_WITHDRAW_OUTPUT_SCHEMA,
  },
  engram_memory_forget: {
    name: 'engram_memory_forget',
    inputSchema: ENGRAM_MEMORY_FORGET_INPUT_SCHEMA,
    outputSchema: ENGRAM_MEMORY_FORGET_OUTPUT_SCHEMA,
  },
} as const;

export interface SchemaValidationSuccess<T> {
  readonly ok: true;
  readonly value: T;
}

export interface SchemaValidationFailure {
  readonly ok: false;
  readonly code: PublicMemoryErrorCode;
  readonly field: string;
  readonly message: string;
}

export type SchemaValidationResult<T> =
  | SchemaValidationSuccess<T>
  | SchemaValidationFailure;

function fail(
  field: string,
  message: string,
  code: PublicMemoryErrorCode = 'INVALID_SCHEMA',
): SchemaValidationFailure {
  return { ok: false, code, field, message };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

export function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

function hasLoneSurrogate(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < value.length ? value.charCodeAt(i + 1) : 0;
      if (next < 0xdc00 || next > 0xdfff) {
        return true;
      }
      i++;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

export function isWellFormedUnicode(value: unknown): value is string {
  return typeof value === 'string' && !hasLoneSurrogate(value);
}

export function isWellFormedUnicodeAndNfc(value: unknown): value is string {
  return (
    isWellFormedUnicode(value) &&
    value.normalize('NFC') === value
  );
}

export function isValidInstant(value: unknown): value is Instant {
  if (typeof value !== 'string' || !INSTANT_MS_UTC_REGEX.test(value)) {
    return false;
  }
  const parsed = Date.parse(value);
  return (
    Number.isFinite(parsed) && new Date(parsed).toISOString() === value
  );
}

export const isValidIsoUtcTimestamp = isValidInstant;

export function isValidSha256Digest(value: unknown): value is Digest {
  return typeof value === 'string' && SHA256_DIGEST_REGEX.test(value);
}

export function isValidCursor(value: unknown): value is Cursor {
  if (typeof value !== 'string' || !CURSOR_U64_REGEX.test(value)) {
    return false;
  }
  try {
    const n = BigInt(value);
    return n >= 0n && n <= MAX_U64;
  } catch {
    return false;
  }
}

export function isValidOpaqueRef(
  value: unknown,
  maxBytes: number = MEMORY_MCP_LIMITS.OPAQUE_REF_MAX_UTF8_BYTES,
): value is OpaqueRef {
  if (!isWellFormedUnicodeAndNfc(value)) {
    return false;
  }
  const bytes = utf8ByteLength(value);
  return (
    bytes >= MEMORY_MCP_LIMITS.OPAQUE_REF_MIN_UTF8_BYTES && bytes <= maxBytes
  );
}

export function isValidRecordId(value: unknown): value is string {
  return isValidOpaqueRef(value) && RECORD_ID_REGEX.test(value);
}

/** M:244,688: candidate identifiers are opaque, without an NFC requirement. */
export function isValidCandidateId(value: unknown): value is string {
  return isWellFormedUnicode(value) && utf8ByteLength(value) >= 1 && utf8ByteLength(value) <= 512;
}

export function isValidIdempotencyKey(value: unknown): value is IdempotencyKey {
  if (!isWellFormedUnicodeAndNfc(value)) {
    return false;
  }
  const bytes = utf8ByteLength(value);
  return (
    bytes >= MEMORY_MCP_LIMITS.IDEMPOTENCY_KEY_MIN_UTF8_BYTES &&
    bytes <= MEMORY_MCP_LIMITS.IDEMPOTENCY_KEY_MAX_UTF8_BYTES
  );
}

export function isValidJsonPointer(value: unknown): value is JsonPointer {
  return (
    isWellFormedUnicodeAndNfc(value) &&
    /^(\/([^/~]|~[01])*)*$/.test(value)
  );
}

function checkAllowedKeys(
  obj: Record<string, unknown>,
  allowedKeys: readonly string[],
  path: string,
): SchemaValidationFailure | null {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(obj)) {
    const fieldPath = path ? `${path}.${key}` : key;
    if (!allowed.has(key)) {
      return fail(
        fieldPath,
        `Unexpected property '${key}' is not permitted by closed schema`,
      );
    }
    if (obj[key] === undefined) {
      return fail(
        fieldPath,
        `Optional property '${key}' must be omitted rather than set to undefined`,
      );
    }
    if (obj[key] === null) {
      return fail(fieldPath, `Property '${key}' must not be null`);
    }
  }
  return null;
}

function checkSerializedArgumentSize(
  value: unknown,
  path = '',
): SchemaValidationFailure | null {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return fail(path, 'Arguments are not JSON-serializable');
  }
  if (
    typeof serialized !== 'string' ||
    utf8ByteLength(serialized) > MEMORY_MCP_LIMITS.MAX_ARGUMENT_OBJECT_UTF8_BYTES
  ) {
    return fail(
      path,
      `Serialized argument object exceeds ${MEMORY_MCP_LIMITS.MAX_ARGUMENT_OBJECT_UTF8_BYTES} UTF-8 bytes`,
    );
  }
  return null;
}

function validateDigestField(
  value: unknown,
  path: string,
): SchemaValidationFailure | null {
  if (!isValidSha256Digest(value)) {
    return fail(
      path,
      `Expected SHA-256 digest matching ${MEMORY_MCP_LIMITS.DIGEST_PATTERN}`,
      'INVALID_DIGEST',
    );
  }
  return null;
}

function validateInstantField(
  value: unknown,
  path: string,
): SchemaValidationFailure | null {
  if (!isValidInstant(value)) {
    return fail(
      path,
      `Expected RFC 3339 millisecond UTC timestamp matching ${MEMORY_MCP_LIMITS.INSTANT_PATTERN}`,
    );
  }
  return null;
}

function validateSafeIntegerEpochField(
  value: unknown,
  path: string,
): SchemaValidationFailure | null {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    return fail(path, 'Expected safe integer epoch timestamp');
  }
  return null;
}

function validateCursorField(
  value: unknown,
  path: string,
): SchemaValidationFailure | null {
  if (!isValidCursor(value)) {
    return fail(path, 'Expected canonical decimal u64 cursor');
  }
  return null;
}

function validateOpaqueRefField(
  value: unknown,
  path: string,
  maxBytes: number = MEMORY_MCP_LIMITS.OPAQUE_REF_MAX_UTF8_BYTES,
): SchemaValidationFailure | null {
  if (!isValidOpaqueRef(value, maxBytes)) {
    return fail(
      path,
      `Expected NFC non-empty string within 1..${maxBytes} UTF-8 bytes`,
    );
  }
  return null;
}

function validateRecordIdField(
  value: unknown,
  path: string,
): SchemaValidationFailure | null {
  if (!isValidRecordId(value)) {
    return fail(
      path,
      `Expected record_id matching ${MEMORY_MCP_LIMITS.RECORD_ID_PATTERN}`,
    );
  }
  return null;
}

function validateCandidateIdField(value: unknown, path: string): SchemaValidationFailure | null {
  return isValidCandidateId(value) ? null : fail(path, 'Expected nonempty candidate identifier within 512 UTF-8 bytes');
}

function validateIdempotencyKeyField(
  value: unknown,
  path: string,
): SchemaValidationFailure | null {
  if (!isValidIdempotencyKey(value)) {
    return fail(
      path,
      `Expected NFC idempotency_key within ${MEMORY_MCP_LIMITS.IDEMPOTENCY_KEY_MIN_UTF8_BYTES}..${MEMORY_MCP_LIMITS.IDEMPOTENCY_KEY_MAX_UTF8_BYTES} UTF-8 bytes`,
    );
  }
  return null;
}

export function validateRecallCapabilityPolicyV1(
  value: unknown,
  path = 'capability_policy',
): SchemaValidationResult<RecallCapabilityPolicyV1> {
  if (!isPlainObject(value)) {
    return fail(path, 'Expected RecallCapabilityPolicyV1 object');
  }
  const keyErr = checkAllowedKeys(
    value,
    ['minimum_channels', 'network'],
    path,
  );
  if (keyErr) return keyErr;

  if (
    value.minimum_channels !== 'lexical' &&
    value.minimum_channels !== 'lexical_and_semantic'
  ) {
    return fail(
      `${path}.minimum_channels`,
      "minimum_channels must be 'lexical' or 'lexical_and_semantic'",
    );
  }
  if (value.network !== 'forbid' && value.network !== 'allow') {
    return fail(`${path}.network`, "network must be 'forbid' or 'allow'");
  }
  return {
    ok: true,
    value: value as unknown as RecallCapabilityPolicyV1,
  };
}

/**
 * M2 Input Validators.
 */
export function validateSearchInputV1(
  value: unknown,
): SchemaValidationResult<SearchInputV1> {
  if (!isPlainObject(value)) {
    return fail('', 'Expected SearchInputV1 object');
  }
  const sizeErr = checkSerializedArgumentSize(value);
  if (sizeErr) return sizeErr;

  const keyErr = checkAllowedKeys(
    value,
    [
      'query',
      'purpose_ref',
      'limit',
      'max_packet_bytes',
      'capability_policy',
      'page_cursor',
    ],
    '',
  );
  if (keyErr) return keyErr;

  if (
    !isWellFormedUnicode(value.query) ||
    value.query.length === 0
  ) {
    return fail('query', 'query must be a non-empty well-formed string');
  }
  const queryBytes = utf8ByteLength(value.query);
  if (
    queryBytes < MEMORY_MCP_LIMITS.QUERY_MIN_UTF8_BYTES ||
    queryBytes > MEMORY_MCP_LIMITS.QUERY_MAX_UTF8_BYTES
  ) {
    return fail(
      'query',
      `query UTF-8 length must be ${MEMORY_MCP_LIMITS.QUERY_MIN_UTF8_BYTES}..${MEMORY_MCP_LIMITS.QUERY_MAX_UTF8_BYTES} bytes`,
    );
  }

  const purposeErr = validateOpaqueRefField(value.purpose_ref, 'purpose_ref');
  if (purposeErr) return purposeErr;

  if ('limit' in value) {
    if (
      typeof value.limit !== 'number' ||
      !Number.isInteger(value.limit) ||
      value.limit < MEMORY_MCP_LIMITS.LIMIT_MIN ||
      value.limit > MEMORY_MCP_LIMITS.LIMIT_MAX
    ) {
      return fail(
        'limit',
        `limit must be an integer in ${MEMORY_MCP_LIMITS.LIMIT_MIN}..${MEMORY_MCP_LIMITS.LIMIT_MAX}`,
      );
    }
  }

  if ('max_packet_bytes' in value) {
    if (
      typeof value.max_packet_bytes !== 'number' ||
      !Number.isInteger(value.max_packet_bytes) ||
      value.max_packet_bytes < MEMORY_MCP_LIMITS.MAX_PACKET_BYTES_MIN ||
      value.max_packet_bytes > MEMORY_MCP_LIMITS.MAX_PACKET_BYTES_MAX
    ) {
      return fail(
        'max_packet_bytes',
        `max_packet_bytes must be an integer in ${MEMORY_MCP_LIMITS.MAX_PACKET_BYTES_MIN}..${MEMORY_MCP_LIMITS.MAX_PACKET_BYTES_MAX}`,
      );
    }
  }

  if ('capability_policy' in value) {
    const capRes = validateRecallCapabilityPolicyV1(
      value.capability_policy,
      'capability_policy',
    );
    if (!capRes.ok) return capRes;
  }

  if ('page_cursor' in value) {
    const curErr = validateOpaqueRefField(value.page_cursor, 'page_cursor');
    if (curErr) return curErr;
  }

  return { ok: true, value: value as unknown as SearchInputV1 };
}

export function validateGetInputV1(
  value: unknown,
): SchemaValidationResult<GetInputV1> {
  if (!isPlainObject(value)) {
    return fail('', 'Expected GetInputV1 object');
  }
  const sizeErr = checkSerializedArgumentSize(value);
  if (sizeErr) return sizeErr;

  const keyErr = checkAllowedKeys(
    value,
    ['record_id', 'purpose_ref', 'max_packet_bytes'],
    '',
  );
  if (keyErr) return keyErr;

  const recErr = validateRecordIdField(value.record_id, 'record_id');
  if (recErr) return recErr;

  const purposeErr = validateOpaqueRefField(value.purpose_ref, 'purpose_ref');
  if (purposeErr) return purposeErr;

  if ('max_packet_bytes' in value) {
    if (
      typeof value.max_packet_bytes !== 'number' ||
      !Number.isInteger(value.max_packet_bytes) ||
      value.max_packet_bytes < MEMORY_MCP_LIMITS.MAX_PACKET_BYTES_MIN ||
      value.max_packet_bytes > MEMORY_MCP_LIMITS.MAX_PACKET_BYTES_MAX
    ) {
      return fail(
        'max_packet_bytes',
        `max_packet_bytes must be an integer in ${MEMORY_MCP_LIMITS.MAX_PACKET_BYTES_MIN}..${MEMORY_MCP_LIMITS.MAX_PACKET_BYTES_MAX}`,
      );
    }
  }

  return { ok: true, value: value as unknown as GetInputV1 };
}

function validateCitationV1(
  value: unknown,
  path: string,
): SchemaValidationResult<CitationV1> {
  if (!isPlainObject(value)) {
    return fail(path, 'Expected CitationV1 object');
  }
  const keyErr = checkAllowedKeys(
    value,
    ['citation_id', 'source_ref', 'locator', 'content_digest', 'observed_at'],
    path,
  );
  if (keyErr) return keyErr;

  const cidErr = validateOpaqueRefField(
    value.citation_id,
    `${path}.citation_id`,
  );
  if (cidErr) return cidErr;

  const srcErr = validateOpaqueRefField(value.source_ref, `${path}.source_ref`);
  if (srcErr) return srcErr;

  if (!isPlainObject(value.locator)) {
    return fail(`${path}.locator`, 'Expected CitationLocatorV1 object');
  }
  const locKeyErr = checkAllowedKeys(
    value.locator,
    ['scheme', 'value'],
    `${path}.locator`,
  );
  if (locKeyErr) return locKeyErr;

  // M2:268-269 / M5:688 require well-formed content, without an NFC constraint.
  for (const [field, maxBytes] of [
    ['scheme', MEMORY_MCP_LIMITS.CITATION_LOCATOR_SCHEME_MAX_UTF8_BYTES],
    ['value', MEMORY_MCP_LIMITS.CITATION_LOCATOR_VALUE_MAX_UTF8_BYTES],
  ] as const) {
    const fieldValue = value.locator[field];
    if (!isWellFormedUnicode(fieldValue) || fieldValue.length === 0 || utf8ByteLength(fieldValue) > maxBytes) {
      return fail(`${path}.locator.${field}`, `Expected nonempty well-formed string within 1..${maxBytes} UTF-8 bytes`);
    }
  }

  const digErr = validateDigestField(
    value.content_digest,
    `${path}.content_digest`,
  );
  if (digErr) return digErr;

  if ('observed_at' in value) {
    const obsErr = validateInstantField(
      value.observed_at,
      `${path}.observed_at`,
    );
    if (obsErr) return obsErr;
  }

  return { ok: true, value: value as unknown as CitationV1 };
}

function validateMemoryComponentV2(
  value: unknown,
  path: string,
): SchemaValidationResult<MemoryComponentV2> {
  if (!isPlainObject(value)) {
    return fail(path, 'Expected MemoryComponentV2 object');
  }
  const keyErr = checkAllowedKeys(
    value,
    ['component_id', 'kind', 'text', 'citation_ids'],
    path,
  );
  if (keyErr) return keyErr;

  const idErr = validateOpaqueRefField(
    value.component_id,
    `${path}.component_id`,
  );
  if (idErr) return idErr;

  if (
    value.kind !== 'context' &&
    value.kind !== 'decision' &&
    value.kind !== 'evidence'
  ) {
    return fail(
      `${path}.kind`,
      "component kind must be 'context', 'decision', or 'evidence'",
    );
  }

  if (
    !isWellFormedUnicode(value.text) ||
    value.text.length === 0
  ) {
    return fail(`${path}.text`, 'component text must be a nonempty well-formed string');
  }
  const textBytes = utf8ByteLength(value.text);
  if (
    textBytes < MEMORY_MCP_LIMITS.COMPONENT_TEXT_MIN_UTF8_BYTES ||
    textBytes > MEMORY_MCP_LIMITS.COMPONENT_TEXT_MAX_UTF8_BYTES
  ) {
    return fail(
      `${path}.text`,
      `component text UTF-8 length must be ${MEMORY_MCP_LIMITS.COMPONENT_TEXT_MIN_UTF8_BYTES}..${MEMORY_MCP_LIMITS.COMPONENT_TEXT_MAX_UTF8_BYTES} bytes`,
    );
  }

  if (
    !Array.isArray(value.citation_ids) ||
    value.citation_ids.length < 1 ||
    value.citation_ids.length > MEMORY_MCP_LIMITS.CITATIONS_MAX_ITEMS
  ) {
    return fail(
      `${path}.citation_ids`,
      `citation_ids must contain 1..${MEMORY_MCP_LIMITS.CITATIONS_MAX_ITEMS} items`,
    );
  }
  const seenCids = new Set<string>();
  for (let i = 0; i < value.citation_ids.length; i++) {
    const cid = value.citation_ids[i];
    const cidErr = validateOpaqueRefField(cid, `${path}.citation_ids[${i}]`);
    if (cidErr) return cidErr;
    if (seenCids.has(cid as string)) {
      return fail(
        `${path}.citation_ids[${i}]`,
        `Duplicate citation_id '${String(cid)}' in component`,
      );
    }
    seenCids.add(cid as string);
  }

  return { ok: true, value: value as unknown as MemoryComponentV2 };
}

export function validateCapturePayloadInputV1(
  value: unknown,
  path = 'payload',
): SchemaValidationResult<CapturePayloadInputV1> {
  if (!isPlainObject(value)) {
    return fail(path, 'Expected CapturePayloadInputV1 object');
  }
  const keyErr = checkAllowedKeys(
    value,
    [
      'schema_version',
      'purpose_ref',
      'valid_time',
      'components',
      'primary_component_id',
      'primary_event',
      'citations',
      'retention',
      'reconciliation',
    ],
    path,
  );
  if (keyErr) return keyErr;

  if (value.schema_version !== ENGRAM_MEMORY_CANDIDATE_SCHEMA_VERSION) {
    return fail(
      `${path}.schema_version`,
      `payload.schema_version must equal ${ENGRAM_MEMORY_CANDIDATE_SCHEMA_VERSION}`,
    );
  }

  const purposeErr = validateOpaqueRefField(
    value.purpose_ref,
    `${path}.purpose_ref`,
  );
  if (purposeErr) return purposeErr;

  if (!isPlainObject(value.valid_time)) {
    return fail(`${path}.valid_time`, 'Expected ValidIntervalV1 object');
  }
  const vtKeyErr = checkAllowedKeys(
    value.valid_time,
    ['t', 't_end'],
    `${path}.valid_time`,
  );
  if (vtKeyErr) return vtKeyErr;
  const tErr = validateSafeIntegerEpochField(
    value.valid_time.t,
    `${path}.valid_time.t`,
  );
  if (tErr) return tErr;
  if ('t_end' in value.valid_time) {
    const tEndErr = validateSafeIntegerEpochField(
      value.valid_time.t_end,
      `${path}.valid_time.t_end`,
    );
    if (tEndErr) return tEndErr;
    if ((value.valid_time.t_end as number) < (value.valid_time.t as number)) {
      return fail(
        `${path}.valid_time.t_end`,
        'valid_time.t_end must be >= valid_time.t',
      );
    }
  }

  if (
    !Array.isArray(value.citations) ||
    value.citations.length < MEMORY_MCP_LIMITS.CITATIONS_MIN_ITEMS ||
    value.citations.length > MEMORY_MCP_LIMITS.CITATIONS_MAX_ITEMS
  ) {
    return fail(
      `${path}.citations`,
      `citations must contain ${MEMORY_MCP_LIMITS.CITATIONS_MIN_ITEMS}..${MEMORY_MCP_LIMITS.CITATIONS_MAX_ITEMS} items`,
    );
  }
  const citationIdSet = new Set<string>();
  for (let i = 0; i < value.citations.length; i++) {
    const citRes = validateCitationV1(
      value.citations[i],
      `${path}.citations[${i}]`,
    );
    if (!citRes.ok) return citRes;
    if (citationIdSet.has(citRes.value.citation_id)) {
      return fail(
        `${path}.citations[${i}].citation_id`,
        `Duplicate citation_id '${citRes.value.citation_id}'`,
      );
    }
    citationIdSet.add(citRes.value.citation_id);
  }

  if (
    !Array.isArray(value.components) ||
    value.components.length < MEMORY_MCP_LIMITS.COMPONENTS_MIN_ITEMS ||
    value.components.length > MEMORY_MCP_LIMITS.COMPONENTS_MAX_ITEMS
  ) {
    return fail(
      `${path}.components`,
      `components must contain ${MEMORY_MCP_LIMITS.COMPONENTS_MIN_ITEMS}..${MEMORY_MCP_LIMITS.COMPONENTS_MAX_ITEMS} items`,
    );
  }
  const componentMap = new Map<string, MemoryComponentV2>();
  for (let i = 0; i < value.components.length; i++) {
    const compRes = validateMemoryComponentV2(
      value.components[i],
      `${path}.components[${i}]`,
    );
    if (!compRes.ok) return compRes;
    if (componentMap.has(compRes.value.component_id)) {
      return fail(
        `${path}.components[${i}].component_id`,
        `Duplicate component_id '${compRes.value.component_id}'`,
      );
    }
    for (const cid of compRes.value.citation_ids) {
      if (!citationIdSet.has(cid)) {
        return fail(
          `${path}.components[${i}].citation_ids`,
          `Component references unknown citation_id '${cid}'`,
        );
      }
    }
    componentMap.set(compRes.value.component_id, compRes.value);
  }

  const primCompErr = validateOpaqueRefField(
    value.primary_component_id,
    `${path}.primary_component_id`,
  );
  if (primCompErr) return primCompErr;
  const primaryComponent = componentMap.get(
    value.primary_component_id as string,
  );
  if (!primaryComponent) {
    return fail(
      `${path}.primary_component_id`,
      'primary_component_id must resolve in components',
    );
  }

  if (!isPlainObject(value.primary_event)) {
    return fail(`${path}.primary_event`, 'Expected PrimaryEventAnchorV1 object');
  }
  const peKeyErr = checkAllowedKeys(
    value.primary_event,
    ['at', 'type_ref', 'citation_id'],
    `${path}.primary_event`,
  );
  if (peKeyErr) return peKeyErr;
  const peAtErr = validateSafeIntegerEpochField(
    value.primary_event.at,
    `${path}.primary_event.at`,
  );
  if (peAtErr) return peAtErr;
  const peTypeErr = validateOpaqueRefField(
    value.primary_event.type_ref,
    `${path}.primary_event.type_ref`,
  );
  if (peTypeErr) return peTypeErr;
  const peCidErr = validateOpaqueRefField(
    value.primary_event.citation_id,
    `${path}.primary_event.citation_id`,
  );
  if (peCidErr) return peCidErr;
  if (
    !citationIdSet.has(value.primary_event.citation_id as string) ||
    !primaryComponent.citation_ids.includes(
      value.primary_event.citation_id as string,
    )
  ) {
    return fail(
      `${path}.primary_event.citation_id`,
      'primary_event.citation_id must resolve in citations and belong to the primary component',
    );
  }

  if ('retention' in value) {
    if (!isPlainObject(value.retention)) {
      return fail(`${path}.retention`, 'Expected RetentionV1 object');
    }
    const retKeyErr = checkAllowedKeys(
      value.retention,
      ['expires_at', 'derivative_rule'],
      `${path}.retention`,
    );
    if (retKeyErr) return retKeyErr;
    if ('expires_at' in value.retention) {
      const expErr = validateInstantField(
        value.retention.expires_at,
        `${path}.retention.expires_at`,
      );
      if (expErr) return expErr;
    }
    if (
      value.retention.derivative_rule !== 'retain' &&
      value.retention.derivative_rule !== 'make-ineligible'
    ) {
      return fail(
        `${path}.retention.derivative_rule`,
        "derivative_rule must be 'retain' or 'make-ineligible'",
      );
    }
  }

  if ('reconciliation' in value) {
    if (!isPlainObject(value.reconciliation)) {
      return fail(
        `${path}.reconciliation`,
        'Expected ReconciliationConsentV1 object',
      );
    }
    const recKeyErr = checkAllowedKeys(
      value.reconciliation,
      ['family_refs'],
      `${path}.reconciliation`,
    );
    if (recKeyErr) return recKeyErr;
    if (
      !Array.isArray(value.reconciliation.family_refs) ||
      value.reconciliation.family_refs.length >
        MEMORY_MCP_LIMITS.RECONCILIATION_FAMILY_REFS_MAX_ITEMS
    ) {
      return fail(
        `${path}.reconciliation.family_refs`,
        `family_refs must be an array of 0..${MEMORY_MCP_LIMITS.RECONCILIATION_FAMILY_REFS_MAX_ITEMS} items`,
      );
    }
    const seenFamilies = new Set<string>();
    for (let i = 0; i < value.reconciliation.family_refs.length; i++) {
      const fRef = value.reconciliation.family_refs[i];
      const fErr = validateOpaqueRefField(
        fRef,
        `${path}.reconciliation.family_refs[${i}]`,
      );
      if (fErr) return fErr;
      if (seenFamilies.has(fRef as string)) {
        return fail(
          `${path}.reconciliation.family_refs[${i}]`,
          `Duplicate family_ref '${String(fRef)}'`,
        );
      }
      if (
        i > 0 &&
        (value.reconciliation.family_refs[i - 1] as string) >= (fRef as string)
      ) {
        return fail(
          `${path}.reconciliation.family_refs[${i}]`,
          'reconciliation.family_refs must be sorted and unique',
        );
      }
      seenFamilies.add(fRef as string);
    }
  }

  return { ok: true, value: value as unknown as CapturePayloadInputV1 };
}

export function validateEvidenceBundleV1(
  value: unknown,
  allowedCitationIds?: ReadonlySet<string>,
  path = 'evidence',
): SchemaValidationResult<EvidenceBundleV1> {
  if (!isPlainObject(value)) {
    return fail(path, 'Expected EvidenceBundleV1 object');
  }
  const keyErr = checkAllowedKeys(
    value,
    ['evidence_ref', 'evidence_digest', 'citation_ids', 'attestation'],
    path,
  );
  if (keyErr) return keyErr;

  const refErr = validateOpaqueRefField(
    value.evidence_ref,
    `${path}.evidence_ref`,
  );
  if (refErr) return refErr;

  const digErr = validateDigestField(
    value.evidence_digest,
    `${path}.evidence_digest`,
  );
  if (digErr) return digErr;

  if (
    !Array.isArray(value.citation_ids) ||
    value.citation_ids.length < 1 ||
    value.citation_ids.length > MEMORY_MCP_LIMITS.CITATIONS_MAX_ITEMS
  ) {
    return fail(
      `${path}.citation_ids`,
      `evidence.citation_ids must contain 1..${MEMORY_MCP_LIMITS.CITATIONS_MAX_ITEMS} items`,
    );
  }
  const seen = new Set<string>();
  for (let i = 0; i < value.citation_ids.length; i++) {
    const cid = value.citation_ids[i];
    const cidErr = validateOpaqueRefField(cid, `${path}.citation_ids[${i}]`);
    if (cidErr) return cidErr;
    if (seen.has(cid as string)) {
      return fail(
        `${path}.citation_ids[${i}]`,
        `Duplicate citation_id '${String(cid)}' in evidence`,
      );
    }
    if (allowedCitationIds && !allowedCitationIds.has(cid as string)) {
      return fail(
        `${path}.citation_ids[${i}]`,
        `evidence.citation_ids[${i}] does not resolve in payload.citations`,
      );
    }
    seen.add(cid as string);
  }

  if ('attestation' in value) {
    const attErr = validateOpaqueRefField(
      value.attestation,
      `${path}.attestation`,
      4096,
    );
    if (attErr) return attErr;
  }

  return { ok: true, value: value as unknown as EvidenceBundleV1 };
}

export function validateCaptureInputV1(
  value: unknown,
): SchemaValidationResult<CaptureInputV1> {
  if (!isPlainObject(value)) {
    return fail('', 'Expected CaptureInputV1 object');
  }
  const sizeErr = checkSerializedArgumentSize(value);
  if (sizeErr) return sizeErr;

  const keyErr = checkAllowedKeys(
    value,
    ['idempotency_key', 'payload', 'evidence'],
    '',
  );
  if (keyErr) return keyErr;

  const idemErr = validateIdempotencyKeyField(
    value.idempotency_key,
    'idempotency_key',
  );
  if (idemErr) return idemErr;

  const payloadRes = validateCapturePayloadInputV1(value.payload, 'payload');
  if (!payloadRes.ok) return payloadRes;

  const payloadCitationIds = new Set(
    payloadRes.value.citations.map((c) => c.citation_id),
  );
  const evidenceRes = validateEvidenceBundleV1(
    value.evidence,
    payloadCitationIds,
    'evidence',
  );
  if (!evidenceRes.ok) return evidenceRes;

  return { ok: true, value: value as unknown as CaptureInputV1 };
}

export function validateRequestAdmissionInputV1(
  value: unknown,
): SchemaValidationResult<RequestAdmissionInputV1> {
  if (!isPlainObject(value)) {
    return fail('', 'Expected RequestAdmissionInputV1 object');
  }
  const sizeErr = checkSerializedArgumentSize(value);
  if (sizeErr) return sizeErr;

  const keyErr = checkAllowedKeys(
    value,
    ['candidate_id', 'idempotency_key'],
    '',
  );
  if (keyErr) return keyErr;

  const candErr = validateCandidateIdField(value.candidate_id, 'candidate_id');
  if (candErr) return candErr;

  const idemErr = validateIdempotencyKeyField(
    value.idempotency_key,
    'idempotency_key',
  );
  if (idemErr) return idemErr;

  return { ok: true, value: value as unknown as RequestAdmissionInputV1 };
}

export function validateWithdrawInputV1(
  value: unknown,
): SchemaValidationResult<WithdrawInputV1> {
  if (!isPlainObject(value)) {
    return fail('', 'Expected WithdrawInputV1 object');
  }
  const sizeErr = checkSerializedArgumentSize(value);
  if (sizeErr) return sizeErr;

  const keyErr = checkAllowedKeys(
    value,
    ['candidate_id', 'idempotency_key', 'reason_ref'],
    '',
  );
  if (keyErr) return keyErr;

  const candErr = validateCandidateIdField(value.candidate_id, 'candidate_id');
  if (candErr) return candErr;

  const idemErr = validateIdempotencyKeyField(
    value.idempotency_key,
    'idempotency_key',
  );
  if (idemErr) return idemErr;

  const reasonErr = validateOpaqueRefField(value.reason_ref, 'reason_ref');
  if (reasonErr) return reasonErr;

  return { ok: true, value: value as unknown as WithdrawInputV1 };
}

export function validateForgetInputV1(
  value: unknown,
): SchemaValidationResult<ForgetInputV1> {
  if (!isPlainObject(value)) {
    return fail('', 'Expected ForgetInputV1 object');
  }
  const sizeErr = checkSerializedArgumentSize(value);
  if (sizeErr) return sizeErr;

  const keyErr = checkAllowedKeys(
    value,
    ['record_id', 'idempotency_key', 'reason_ref'],
    '',
  );
  if (keyErr) return keyErr;

  const recErr = validateRecordIdField(value.record_id, 'record_id');
  if (recErr) return recErr;

  const idemErr = validateIdempotencyKeyField(
    value.idempotency_key,
    'idempotency_key',
  );
  if (idemErr) return idemErr;

  const reasonErr = validateOpaqueRefField(value.reason_ref, 'reason_ref');
  if (reasonErr) return reasonErr;

  return { ok: true, value: value as unknown as ForgetInputV1 };
}

export function validateToolInputByName(
  toolName: EngramMemoryToolName,
  value: unknown,
): SchemaValidationResult<unknown> {
  switch (toolName) {
    case 'engram_memory_search':
      return validateSearchInputV1(value);
    case 'engram_memory_get':
      return validateGetInputV1(value);
    case 'engram_memory_capture':
      return validateCaptureInputV1(value);
    case 'engram_memory_request_admission':
      return validateRequestAdmissionInputV1(value);
    case 'engram_memory_withdraw':
      return validateWithdrawInputV1(value);
    case 'engram_memory_forget':
      return validateForgetInputV1(value);
  }
}

function validateTrustBindingV1(
  value: unknown,
  path: string,
): SchemaValidationResult<TrustBindingV1> {
  if (!isPlainObject(value)) {
    return fail(path, 'Expected TrustBindingV1 object');
  }
  const keyErr = checkAllowedKeys(
    value,
    [
      'class',
      'evidence_digest',
      'verifier_id',
      'verifier_version',
      'issued_at',
      'expires_at',
      'revocation_epoch',
      'receipt_digest',
    ],
    path,
  );
  if (keyErr) return keyErr;

  if (
    value.class !== 'earned' &&
    value.class !== 'asserted' &&
    value.class !== 'signed'
  ) {
    return fail(
      `${path}.class`,
      "trust.class must be 'earned', 'asserted', or 'signed'",
    );
  }
  const edErr = validateDigestField(
    value.evidence_digest,
    `${path}.evidence_digest`,
  );
  if (edErr) return edErr;
  const vidErr = validateOpaqueRefField(
    value.verifier_id,
    `${path}.verifier_id`,
  );
  if (vidErr) return vidErr;
  const vverErr = validateOpaqueRefField(
    value.verifier_version,
    `${path}.verifier_version`,
  );
  if (vverErr) return vverErr;
  const issErr = validateInstantField(value.issued_at, `${path}.issued_at`);
  if (issErr) return issErr;
  if ('expires_at' in value) {
    const expErr = validateInstantField(value.expires_at, `${path}.expires_at`);
    if (expErr) return expErr;
  }
  const revErr = validateCursorField(
    value.revocation_epoch,
    `${path}.revocation_epoch`,
  );
  if (revErr) return revErr;
  const recErr = validateDigestField(
    value.receipt_digest,
    `${path}.receipt_digest`,
  );
  if (recErr) return recErr;

  return { ok: true, value: value as unknown as TrustBindingV1 };
}

/**
 * Neutral V3/V1 Read Record & Packet Validators (`RedactedMemoryRecordV2`,
 * `RecallRecordPacketV3`, `RankReceiptV1`, `MemoryReadReceiptV1`,
 * `MemoryReadPacketV1`).
 */
export function validateRedactedMemoryRecordV2(
  value: unknown,
  path = 'record',
): SchemaValidationResult<RedactedMemoryRecordV2> {
  if (!isPlainObject(value)) {
    return fail(path, 'Expected RedactedMemoryRecordV2 object');
  }
  const keyErr = checkAllowedKeys(
    value,
    [
      'record_id',
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
      'derivation',
      'payload_digest',
      'record_digest',
      'recorded_at',
      'recorded_cursor',
      'authorization_receipt_digest',
      'trust',
    ],
    path,
  );
  if (keyErr) return keyErr;

  const recErr = validateRecordIdField(value.record_id, `${path}.record_id`);
  if (recErr) return recErr;

  if ('schema_version' in value && value.schema_version !== 2) {
    return fail(`${path}.schema_version`, 'schema_version must equal 2');
  }
  if ('scope_ref' in value) {
    const err = validateOpaqueRefField(value.scope_ref, `${path}.scope_ref`);
    if (err) return err;
  }
  if ('purpose_ref' in value) {
    const err = validateOpaqueRefField(
      value.purpose_ref,
      `${path}.purpose_ref`,
    );
    if (err) return err;
  }
  if ('valid_time' in value) {
    if (!isPlainObject(value.valid_time)) {
      return fail(`${path}.valid_time`, 'Expected ValidIntervalV1 object');
    }
    const vtKeyErr = checkAllowedKeys(
      value.valid_time,
      ['t', 't_end'],
      `${path}.valid_time`,
    );
    if (vtKeyErr) return vtKeyErr;
    const tErr = validateSafeIntegerEpochField(
      value.valid_time.t,
      `${path}.valid_time.t`,
    );
    if (tErr) return tErr;
    if ('t_end' in value.valid_time) {
      const teErr = validateSafeIntegerEpochField(
        value.valid_time.t_end,
        `${path}.valid_time.t_end`,
      );
      if (teErr) return teErr;
      if ((value.valid_time.t_end as number) < (value.valid_time.t as number)) {
        return fail(
          `${path}.valid_time.t_end`,
          'valid_time.t_end must be >= valid_time.t',
        );
      }
    }
  }

  let citationIdSet: Set<string> | undefined;
  if ('citations' in value) {
    if (
      !Array.isArray(value.citations) ||
      value.citations.length < 1 ||
      value.citations.length > MEMORY_MCP_LIMITS.CITATIONS_MAX_ITEMS
    ) {
      return fail(
        `${path}.citations`,
        `citations must contain 1..${MEMORY_MCP_LIMITS.CITATIONS_MAX_ITEMS} items`,
      );
    }
    citationIdSet = new Set<string>();
    for (let i = 0; i < value.citations.length; i++) {
      const citRes = validateCitationV1(
        value.citations[i],
        `${path}.citations[${i}]`,
      );
      if (!citRes.ok) return citRes;
      if (citationIdSet.has(citRes.value.citation_id)) {
        return fail(
          `${path}.citations[${i}].citation_id`,
          `Duplicate citation_id '${citRes.value.citation_id}'`,
        );
      }
      citationIdSet.add(citRes.value.citation_id);
    }
  }

  let componentIdSet: Set<string> | undefined;
  if ('components' in value) {
    if (
      !Array.isArray(value.components) ||
      value.components.length < 1 ||
      value.components.length > MEMORY_MCP_LIMITS.COMPONENTS_MAX_ITEMS
    ) {
      return fail(
        `${path}.components`,
        `components must contain 1..${MEMORY_MCP_LIMITS.COMPONENTS_MAX_ITEMS} items`,
      );
    }
    componentIdSet = new Set<string>();
    for (let i = 0; i < value.components.length; i++) {
      const compRes = validateMemoryComponentV2(
        value.components[i],
        `${path}.components[${i}]`,
      );
      if (!compRes.ok) return compRes;
      if (componentIdSet.has(compRes.value.component_id)) {
        return fail(
          `${path}.components[${i}].component_id`,
          `Duplicate component_id '${compRes.value.component_id}'`,
        );
      }
      componentIdSet.add(compRes.value.component_id);
      if (!citationIdSet) {
        return fail(
          `${path}.citations`,
          'citations must be present when components are present so citation_ids resolve',
        );
      }
      for (const cid of compRes.value.citation_ids) {
        if (!citationIdSet.has(cid)) {
          return fail(
            `${path}.components[${i}].citation_ids`,
            `Component references unknown citation_id '${cid}'`,
          );
        }
      }
    }
  }

  if ('primary_component_id' in value) {
    const pcErr = validateOpaqueRefField(
      value.primary_component_id,
      `${path}.primary_component_id`,
    );
    if (pcErr) return pcErr;
    if (
      componentIdSet &&
      componentIdSet.size > 0 &&
      !componentIdSet.has(value.primary_component_id as string)
    ) {
      return fail(
        `${path}.primary_component_id`,
        'primary_component_id must resolve in surviving components',
      );
    }
  }

  if ('primary_event' in value) {
    if (!isPlainObject(value.primary_event)) {
      return fail(
        `${path}.primary_event`,
        'Expected PrimaryEventAnchorV1 object',
      );
    }
    const peKeyErr = checkAllowedKeys(
      value.primary_event,
      ['at', 'type_ref', 'citation_id'],
      `${path}.primary_event`,
    );
    if (peKeyErr) return peKeyErr;
    const atErr = validateSafeIntegerEpochField(
      value.primary_event.at,
      `${path}.primary_event.at`,
    );
    if (atErr) return atErr;
    const trErr = validateOpaqueRefField(
      value.primary_event.type_ref,
      `${path}.primary_event.type_ref`,
    );
    if (trErr) return trErr;
    const cidErr = validateOpaqueRefField(
      value.primary_event.citation_id,
      `${path}.primary_event.citation_id`,
    );
    if (cidErr) return cidErr;
    if (
      citationIdSet &&
      !citationIdSet.has(value.primary_event.citation_id as string)
    ) {
      return fail(
        `${path}.primary_event.citation_id`,
        'primary_event.citation_id must resolve in surviving citations',
      );
    }
  }

  if ('derivation' in value) {
    if (!isPlainObject(value.derivation)) {
      return fail(`${path}.derivation`, 'Expected DerivationLineageV1 object');
    }
    const dKeyErr = checkAllowedKeys(
      value.derivation,
      ['source_record_ids', 'transform_ref', 'transform_receipt_digest'],
      `${path}.derivation`,
    );
    if (dKeyErr) return dKeyErr;
    if (
      !Array.isArray(value.derivation.source_record_ids) ||
      value.derivation.source_record_ids.length < 1 ||
      value.derivation.source_record_ids.length > 64
    ) {
      return fail(
        `${path}.derivation.source_record_ids`,
        'source_record_ids must contain 1..64 record IDs',
      );
    }
    for (let i = 0; i < value.derivation.source_record_ids.length; i++) {
      const sErr = validateOpaqueRefField(
        value.derivation.source_record_ids[i],
        `${path}.derivation.source_record_ids[${i}]`,
      );
      if (sErr) return sErr;
    }
    const trErr = validateOpaqueRefField(
      value.derivation.transform_ref,
      `${path}.derivation.transform_ref`,
    );
    if (trErr) return trErr;
    const trdErr = validateDigestField(
      value.derivation.transform_receipt_digest,
      `${path}.derivation.transform_receipt_digest`,
    );
    if (trdErr) return trdErr;
  }

  if ('retention' in value) {
    if (!isPlainObject(value.retention)) {
      return fail(`${path}.retention`, 'Expected RetentionV1 object');
    }
    const rKeyErr = checkAllowedKeys(
      value.retention,
      ['expires_at', 'derivative_rule'],
      `${path}.retention`,
    );
    if (rKeyErr) return rKeyErr;
    if ('expires_at' in value.retention) {
      const expErr = validateInstantField(
        value.retention.expires_at,
        `${path}.retention.expires_at`,
      );
      if (expErr) return expErr;
    }
    if (
      value.retention.derivative_rule !== 'retain' &&
      value.retention.derivative_rule !== 'make-ineligible'
    ) {
      return fail(
        `${path}.retention.derivative_rule`,
        "derivative_rule must be 'retain' or 'make-ineligible'",
      );
    }
  }

  if ('reconciliation' in value) {
    if (!isPlainObject(value.reconciliation)) {
      return fail(
        `${path}.reconciliation`,
        'Expected ReconciliationConsentV1 object',
      );
    }
    const recKeyErr = checkAllowedKeys(
      value.reconciliation,
      ['family_refs'],
      `${path}.reconciliation`,
    );
    if (recKeyErr) return recKeyErr;
    if (
      !Array.isArray(value.reconciliation.family_refs) ||
      value.reconciliation.family_refs.length > 64
    ) {
      return fail(
        `${path}.reconciliation.family_refs`,
        'family_refs must contain 0..64 items',
      );
    }
    for (let i = 0; i < value.reconciliation.family_refs.length; i++) {
      const fErr = validateOpaqueRefField(
        value.reconciliation.family_refs[i],
        `${path}.reconciliation.family_refs[${i}]`,
      );
      if (fErr) return fErr;
    }
  }

  if ('payload_digest' in value) {
    const err = validateDigestField(
      value.payload_digest,
      `${path}.payload_digest`,
    );
    if (err) return err;
  }
  if ('record_digest' in value) {
    const err = validateDigestField(
      value.record_digest,
      `${path}.record_digest`,
    );
    if (err) return err;
  }
  if ('recorded_at' in value) {
    const err = validateInstantField(value.recorded_at, `${path}.recorded_at`);
    if (err) return err;
  }
  if ('recorded_cursor' in value) {
    const err = validateCursorField(
      value.recorded_cursor,
      `${path}.recorded_cursor`,
    );
    if (err) return err;
  }
  if ('authorization_receipt_digest' in value) {
    const err = validateDigestField(
      value.authorization_receipt_digest,
      `${path}.authorization_receipt_digest`,
    );
    if (err) return err;
  }
  if ('trust' in value) {
    const tRes = validateTrustBindingV1(value.trust, `${path}.trust`);
    if (!tRes.ok) return tRes;
  }

  return { ok: true, value: value as unknown as RedactedMemoryRecordV2 };
}

export function validateRecallRecordPacketV3(
  value: unknown,
  path = 'records[]',
): SchemaValidationResult<RecallRecordPacketV3> {
  if (!isPlainObject(value)) {
    return fail(path, 'Expected RecallRecordPacketV3 object');
  }
  const keyErr = checkAllowedKeys(
    value,
    [
      'record',
      'redacted_fields',
      'redaction_receipt_digest',
      'score',
      'rank',
    ],
    path,
  );
  if (keyErr) return keyErr;

  const recRes = validateRedactedMemoryRecordV2(
    value.record,
    `${path}.record`,
  );
  if (!recRes.ok) return recRes;

  if (!Array.isArray(value.redacted_fields)) {
    return fail(
      `${path}.redacted_fields`,
      'redacted_fields must be an array of JsonPointers',
    );
  }
  for (let i = 0; i < value.redacted_fields.length; i++) {
    if (!isValidJsonPointer(value.redacted_fields[i])) {
      return fail(
        `${path}.redacted_fields[${i}]`,
        'Expected RFC 6901 JsonPointer',
      );
    }
  }

  const rrdErr = validateDigestField(
    value.redaction_receipt_digest,
    `${path}.redaction_receipt_digest`,
  );
  if (rrdErr) return rrdErr;

  if (typeof value.score !== 'number' || !Number.isFinite(value.score)) {
    return fail(`${path}.score`, 'score must be a finite number');
  }

  if (
    typeof value.rank !== 'number' ||
    !Number.isInteger(value.rank) ||
    value.rank < 1
  ) {
    return fail(`${path}.rank`, 'rank must be an integer >= 1');
  }

  return { ok: true, value: value as unknown as RecallRecordPacketV3 };
}

export function validateRankReceiptV1(
  value: unknown,
  path = 'rank_receipt',
): SchemaValidationResult<RankReceiptV1> {
  if (!isPlainObject(value)) {
    return fail(path, 'Expected RankReceiptV1 object');
  }
  const keyErr = checkAllowedKeys(
    value,
    [
      'request_digest',
      'authorization_receipt_digest',
      'profile',
      'profile_version',
      'profile_config_digest',
      'valid_as_of',
      'system_as_of',
      'snapshot_id',
      'snapshot_digest',
      'candidate_count',
      'candidate_ids_digest',
      'scoring_formula_ref',
      'ordered_ids_digest',
      'revalidation_receipt_digest',
      'projection_receipt_digests',
      'issued_at',
      'receipt_digest',
    ],
    path,
  );
  if (keyErr) return keyErr;

  for (const df of [
    'request_digest',
    'authorization_receipt_digest',
    'profile_config_digest',
    'snapshot_digest',
    'candidate_ids_digest',
    'ordered_ids_digest',
    'revalidation_receipt_digest',
    'receipt_digest',
  ] as const) {
    const err = validateDigestField(value[df], `${path}.${df}`);
    if (err) return err;
  }

  if (
    value.profile !== 'offline_lexical_v1' &&
    value.profile !== 'semantic_v1'
  ) {
    return fail(
      `${path}.profile`,
      "profile must be 'offline_lexical_v1' or 'semantic_v1'",
    );
  }

  for (const rf of [
    'profile_version',
    'snapshot_id',
    'scoring_formula_ref',
  ] as const) {
    const err = validateOpaqueRefField(value[rf], `${path}.${rf}`);
    if (err) return err;
  }

  const vaoErr = validateSafeIntegerEpochField(
    value.valid_as_of,
    `${path}.valid_as_of`,
  );
  if (vaoErr) return vaoErr;

  const saoErr = validateCursorField(
    value.system_as_of,
    `${path}.system_as_of`,
  );
  if (saoErr) return saoErr;

  if (
    typeof value.candidate_count !== 'number' ||
    !Number.isInteger(value.candidate_count) ||
    value.candidate_count < 0
  ) {
    return fail(
      `${path}.candidate_count`,
      'candidate_count must be an integer >= 0',
    );
  }

  if (!Array.isArray(value.projection_receipt_digests)) {
    return fail(
      `${path}.projection_receipt_digests`,
      'projection_receipt_digests must be an array of Digests',
    );
  }
  for (let i = 0; i < value.projection_receipt_digests.length; i++) {
    const err = validateDigestField(
      value.projection_receipt_digests[i],
      `${path}.projection_receipt_digests[${i}]`,
    );
    if (err) return err;
  }

  const issErr = validateInstantField(value.issued_at, `${path}.issued_at`);
  if (issErr) return issErr;

  return { ok: true, value: value as unknown as RankReceiptV1 };
}

export function validateMemoryReadReceiptV1(
  value: unknown,
  path = 'read_receipt',
): SchemaValidationResult<MemoryReadReceiptV1> {
  if (!isPlainObject(value)) {
    return fail(path, 'Expected MemoryReadReceiptV1 object');
  }
  const keyErr = checkAllowedKeys(
    value,
    [
      'record_id',
      'record_digest',
      'valid_as_of',
      'system_as_of',
      'validated_through_cursor',
      'authorization_receipt_digest',
      'revalidation_receipt_digest',
      'checked_at',
      'receipt_digest',
    ],
    path,
  );
  if (keyErr) return keyErr;

  const recIdErr = validateRecordIdField(
    value.record_id,
    `${path}.record_id`,
  );
  if (recIdErr) return recIdErr;

  for (const df of [
    'record_digest',
    'authorization_receipt_digest',
    'revalidation_receipt_digest',
    'receipt_digest',
  ] as const) {
    const err = validateDigestField(value[df], `${path}.${df}`);
    if (err) return err;
  }

  const vaoErr = validateSafeIntegerEpochField(
    value.valid_as_of,
    `${path}.valid_as_of`,
  );
  if (vaoErr) return vaoErr;

  const saoErr = validateCursorField(
    value.system_as_of,
    `${path}.system_as_of`,
  );
  if (saoErr) return saoErr;

  const vtcErr = validateCursorField(
    value.validated_through_cursor,
    `${path}.validated_through_cursor`,
  );
  if (vtcErr) return vtcErr;

  const chkErr = validateInstantField(value.checked_at, `${path}.checked_at`);
  if (chkErr) return chkErr;

  return { ok: true, value: value as unknown as MemoryReadReceiptV1 };
}

/**
 * M2 Output Payload Validators.
 */
export function validateSearchOutputV1(
  value: unknown,
  path = 'output.value',
): SchemaValidationResult<SearchOutputV1> {
  if (!isPlainObject(value)) {
    return fail(path, 'Expected SearchPageV1 object');
  }
  const keyErr = checkAllowedKeys(
    value,
    ['records', 'rank_receipt', 'next_page_cursor', 'response_digest'],
    path,
  );
  if (keyErr) return keyErr;

  if (
    !Array.isArray(value.records) ||
    value.records.length > MEMORY_MCP_LIMITS.LIMIT_MAX
  ) {
    return fail(
      `${path}.records`,
      `records must be an array of 0..${MEMORY_MCP_LIMITS.LIMIT_MAX} items`,
    );
  }
  for (let i = 0; i < value.records.length; i++) {
    const itemRes = validateRecallRecordPacketV3(
      value.records[i],
      `${path}.records[${i}]`,
    );
    if (!itemRes.ok) return itemRes;
  }

  const rrRes = validateRankReceiptV1(
    value.rank_receipt,
    `${path}.rank_receipt`,
  );
  if (!rrRes.ok) return rrRes;

  if ('next_page_cursor' in value) {
    const curErr = validateOpaqueRefField(
      value.next_page_cursor,
      `${path}.next_page_cursor`,
    );
    if (curErr) return curErr;
  }

  const digErr = validateDigestField(
    value.response_digest,
    `${path}.response_digest`,
  );
  if (digErr) return digErr;

  return { ok: true, value: value as unknown as SearchPageV1 };
}

export function validateGetOutputV1(
  value: unknown,
  path = 'output.value',
): SchemaValidationResult<GetOutputV1> {
  if (!isPlainObject(value)) {
    return fail(path, 'Expected MemoryReadPacketV1 object');
  }
  const keyErr = checkAllowedKeys(
    value,
    [
      'record',
      'redacted_fields',
      'redaction_receipt_digest',
      'read_receipt',
      'packet_digest',
    ],
    path,
  );
  if (keyErr) return keyErr;

  const recRes = validateRedactedMemoryRecordV2(
    value.record,
    `${path}.record`,
  );
  if (!recRes.ok) return recRes;

  if (!Array.isArray(value.redacted_fields)) {
    return fail(
      `${path}.redacted_fields`,
      'redacted_fields must be an array of JsonPointers',
    );
  }
  for (let i = 0; i < value.redacted_fields.length; i++) {
    if (!isValidJsonPointer(value.redacted_fields[i])) {
      return fail(
        `${path}.redacted_fields[${i}]`,
        'Expected RFC 6901 JsonPointer',
      );
    }
  }

  const rrdErr = validateDigestField(
    value.redaction_receipt_digest,
    `${path}.redaction_receipt_digest`,
  );
  if (rrdErr) return rrdErr;

  const rrRes = validateMemoryReadReceiptV1(
    value.read_receipt,
    `${path}.read_receipt`,
  );
  if (!rrRes.ok) return rrRes;

  if (recRes.value.record_id !== rrRes.value.record_id) {
    return fail(
      `${path}.read_receipt.record_id`,
      'read_receipt.record_id must equal record.record_id',
    );
  }

  const digErr = validateDigestField(
    value.packet_digest,
    `${path}.packet_digest`,
  );
  if (digErr) return digErr;

  return { ok: true, value: value as unknown as MemoryReadPacketV1 };
}

export function validateCaptureOutputV1(
  value: unknown,
  path = 'output.value',
): SchemaValidationResult<CaptureOutputV1> {
  if (!isPlainObject(value)) {
    return fail(path, 'Expected CaptureOutputV1 object');
  }
  const keyErr = checkAllowedKeys(
    value,
    [
      'status',
      'candidate_id',
      'record_digest',
      'cursor',
      'transaction_receipt_digest',
    ],
    path,
  );
  if (keyErr) return keyErr;

  if (
    value.status !== 'committed_pending' &&
    value.status !== 'duplicate_exact'
  ) {
    return fail(
      `${path}.status`,
      "status must be 'committed_pending' or 'duplicate_exact'",
    );
  }

  const candErr = validateCandidateIdField(
    value.candidate_id,
    `${path}.candidate_id`,
  );
  if (candErr) return candErr;

  if ('record_digest' in value) {
    const rdErr = validateDigestField(
      value.record_digest,
      `${path}.record_digest`,
    );
    if (rdErr) return rdErr;
  }

  const curErr = validateCursorField(value.cursor, `${path}.cursor`);
  if (curErr) return curErr;

  const trdErr = validateDigestField(
    value.transaction_receipt_digest,
    `${path}.transaction_receipt_digest`,
  );
  if (trdErr) return trdErr;

  return { ok: true, value: value as unknown as CaptureOutputV1 };
}

export function validateAdmissionOutcomeV1(
  value: unknown,
  path = 'outcome',
): SchemaValidationResult<AdmissionOutcomeV1> {
  if (!isPlainObject(value)) {
    return fail(path, 'Expected AdmissionOutcomeV1 object');
  }
  const keyErr = checkAllowedKeys(
    value,
    [
      'status',
      'candidate_id',
      'record_id',
      'cursor',
      'decision_receipt_digest',
      'transaction_receipt_digest',
    ],
    path,
  );
  if (keyErr) return keyErr;

  if (
    value.status !== 'accepted' &&
    value.status !== 'rejected' &&
    value.status !== 'pending_adjudication' &&
    value.status !== 'duplicate_exact'
  ) {
    return fail(
      `${path}.status`,
      "outcome.status must be 'accepted', 'rejected', 'pending_adjudication', or 'duplicate_exact'",
    );
  }

  const cErr = validateCandidateIdField(
    value.candidate_id,
    `${path}.candidate_id`,
  );
  if (cErr) return cErr;

  if (value.status === 'accepted') {
    const rErr = validateRecordIdField(value.record_id, `${path}.record_id`);
    if (rErr) return rErr;
  } else if ('record_id' in value) {
    const rErr = validateRecordIdField(value.record_id, `${path}.record_id`);
    if (rErr) return rErr;
  }

  const curErr = validateCursorField(value.cursor, `${path}.cursor`);
  if (curErr) return curErr;

  const drErr = validateDigestField(
    value.decision_receipt_digest,
    `${path}.decision_receipt_digest`,
  );
  if (drErr) return drErr;

  const trErr = validateDigestField(
    value.transaction_receipt_digest,
    `${path}.transaction_receipt_digest`,
  );
  if (trErr) return trErr;

  return { ok: true, value: value as unknown as AdmissionOutcomeV1 };
}

export function validateRequestAdmissionOutputV1(
  value: unknown,
  path = 'output.value',
): SchemaValidationResult<RequestAdmissionOutputV1> {
  if (!isPlainObject(value)) {
    return fail(path, 'Expected RequestAdmissionOutputV1 object');
  }
  const keyErr = checkAllowedKeys(value, ['outcome', 'replayed'], path);
  if (keyErr) return keyErr;

  const outRes = validateAdmissionOutcomeV1(value.outcome, `${path}.outcome`);
  if (!outRes.ok) return outRes;

  if (typeof value.replayed !== 'boolean') {
    return fail(`${path}.replayed`, 'replayed must be boolean');
  }

  return { ok: true, value: value as unknown as RequestAdmissionOutputV1 };
}

function validateLifecycleReceiptBaseV1(
  value: unknown,
  path: string,
): SchemaValidationResult<LifecycleReceiptV1> {
  if (!isPlainObject(value)) {
    return fail(path, 'Expected LifecycleReceiptV1 object');
  }
  const keyErr = checkAllowedKeys(
    value,
    [
      'event_id',
      'operation',
      'from_state',
      'to_state',
      'cursor',
      'event_digest',
      'authorization_receipt_digest',
      'transaction_receipt_digest',
    ],
    path,
  );
  if (keyErr) return keyErr;

  const evErr = validateIdempotencyKeyField(
    value.event_id,
    `${path}.event_id`,
  );
  if (evErr) return evErr;
  const curErr = validateCursorField(value.cursor, `${path}.cursor`);
  if (curErr) return curErr;

  for (const df of [
    'event_digest',
    'authorization_receipt_digest',
    'transaction_receipt_digest',
  ] as const) {
    const err = validateDigestField(value[df], `${path}.${df}`);
    if (err) return err;
  }

  return { ok: true, value: value as unknown as LifecycleReceiptV1 };
}

export function validateWithdrawOutputV1(
  value: unknown,
  path = 'output.value',
): SchemaValidationResult<WithdrawOutputV1> {
  if (!isPlainObject(value)) {
    return fail(path, 'Expected WithdrawOutputV1 object');
  }
  const keyErr = checkAllowedKeys(
    value,
    ['receipt', 'replayed', 'key_destruction'],
    path,
  );
  if (keyErr) return keyErr;

  const recRes = validateLifecycleReceiptBaseV1(
    value.receipt,
    `${path}.receipt`,
  );
  if (!recRes.ok) return recRes;

  if (recRes.value.operation !== 'withdraw') {
    return fail(
      `${path}.receipt.operation`,
      "receipt.operation must equal 'withdraw'",
    );
  }
  if (recRes.value.from_state !== 'pending') {
    return fail(
      `${path}.receipt.from_state`,
      "receipt.from_state must equal 'pending'",
    );
  }
  if (recRes.value.to_state !== 'withdrawn') {
    return fail(
      `${path}.receipt.to_state`,
      "receipt.to_state must equal 'withdrawn'",
    );
  }

  if (typeof value.replayed !== 'boolean') {
    return fail(`${path}.replayed`, 'replayed must be boolean');
  }
  if (
    value.key_destruction !== 'pending' &&
    value.key_destruction !== 'complete'
  ) {
    return fail(
      `${path}.key_destruction`,
      "key_destruction must be 'pending' or 'complete'",
    );
  }

  return { ok: true, value: value as unknown as WithdrawOutputV1 };
}

export function validateForgetOutputV1(
  value: unknown,
  path = 'output.value',
): SchemaValidationResult<ForgetOutputV1> {
  if (!isPlainObject(value)) {
    return fail(path, 'Expected ForgetOutputV1 object');
  }
  const keyErr = checkAllowedKeys(
    value,
    [
      'receipt',
      'replayed',
      'projection_invalidation',
      'coverage_receipt_digest',
    ],
    path,
  );
  if (keyErr) return keyErr;

  const recRes = validateLifecycleReceiptBaseV1(
    value.receipt,
    `${path}.receipt`,
  );
  if (!recRes.ok) return recRes;

  if (recRes.value.operation !== 'tombstone') {
    return fail(
      `${path}.receipt.operation`,
      "receipt.operation must equal 'tombstone'",
    );
  }

  if (
    !(TOMBSTONE_ALLOWED_FROM_STATES as readonly string[]).includes(
      recRes.value.from_state,
    )
  ) {
    return fail(
      `${path}.receipt.from_state`,
      'receipt.from_state must be an admitted/post-admission state eligible for tombstone',
    );
  }
  if (recRes.value.to_state !== 'tombstoned') {
    return fail(
      `${path}.receipt.to_state`,
      "receipt.to_state must equal 'tombstoned'",
    );
  }

  if (typeof value.replayed !== 'boolean') {
    return fail(`${path}.replayed`, 'replayed must be boolean');
  }
  if (
    value.projection_invalidation !== 'pending' &&
    value.projection_invalidation !== 'complete'
  ) {
    return fail(
      `${path}.projection_invalidation`,
      "projection_invalidation must be 'pending' or 'complete'",
    );
  }

  if ('coverage_receipt_digest' in value) {
    if (value.projection_invalidation === 'pending') {
      return fail(
        `${path}.coverage_receipt_digest`,
        "coverage_receipt_digest must be omitted while projection_invalidation is 'pending'",
      );
    }
    const covErr = validateDigestField(
      value.coverage_receipt_digest,
      `${path}.coverage_receipt_digest`,
    );
    if (covErr) return covErr;
  }

  return { ok: true, value: value as unknown as ForgetOutputV1 };
}

/**
 * M2 Sentropic `AppResultEnvelope` validator (`ToolSuccessV1<T>` | `ToolFailureV1`).
 */
export function validateToolResultV1(
  toolName: EngramMemoryToolName,
  value: unknown,
): SchemaValidationResult<ToolResultV1<unknown>> {
  if (!isPlainObject(value)) {
    return fail('', 'Expected AppResultEnvelope object');
  }

  const auditErr = validateOpaqueRefField(value.auditId, 'auditId');
  if (auditErr) return auditErr;

  if (value.redactionClass !== 'high') {
    return fail('redactionClass', "redactionClass must equal 'high'");
  }

  if (value.ok === true) {
    const keyErr = checkAllowedKeys(
      value,
      ['ok', 'output', 'auditId', 'redactionClass'],
      '',
    );
    if (keyErr) return keyErr;

    if (!isPlainObject(value.output)) {
      return fail('output', 'Expected output object');
    }
    const outKeyErr = checkAllowedKeys(
      value.output,
      ['schema_version', 'value'],
      'output',
    );
    if (outKeyErr) return outKeyErr;

    if (
      value.output.schema_version !==
      ENGRAM_MEMORY_STRUCTURED_OUTPUT_SCHEMA_VERSION
    ) {
      return fail(
        'output.schema_version',
        `output.schema_version must equal ${ENGRAM_MEMORY_STRUCTURED_OUTPUT_SCHEMA_VERSION}`,
      );
    }

    let res: SchemaValidationResult<unknown>;
    switch (toolName) {
      case 'engram_memory_search':
        res = validateSearchOutputV1(value.output.value, 'output.value');
        break;
      case 'engram_memory_get':
        res = validateGetOutputV1(value.output.value, 'output.value');
        break;
      case 'engram_memory_capture':
        res = validateCaptureOutputV1(value.output.value, 'output.value');
        break;
      case 'engram_memory_request_admission':
        res = validateRequestAdmissionOutputV1(
          value.output.value,
          'output.value',
        );
        break;
      case 'engram_memory_withdraw':
        res = validateWithdrawOutputV1(value.output.value, 'output.value');
        break;
      case 'engram_memory_forget':
        res = validateForgetOutputV1(value.output.value, 'output.value');
        break;
    }
    if (!res.ok) return res;
    return { ok: true, value: value as unknown as ToolResultV1<unknown> };
  }

  if (value.ok === false) {
    const keyErr = checkAllowedKeys(
      value,
      ['ok', 'auditId', 'redactionClass', 'error'],
      '',
    );
    if (keyErr) return keyErr;

    if (!isPlainObject(value.error)) {
      return fail('error', 'Expected error object');
    }
    const errKeyErr = checkAllowedKeys(
      value.error,
      ['code', 'message', 'retriable'],
      'error',
    );
    if (errKeyErr) return errKeyErr;

    if (
      typeof value.error.code !== 'string' ||
      !(PUBLIC_MEMORY_ERROR_CODES as readonly string[]).includes(
        value.error.code,
      )
    ) {
      return fail('error.code', 'Invalid PublicMemoryErrorCode');
    }
    if (
      !isWellFormedUnicodeAndNfc(value.error.message) ||
      value.error.message.trim().length < 1 ||
      utf8ByteLength(value.error.message) > 1024
    ) {
      return fail(
        'error.message',
        'error.message must be a non-empty NFC string <= 1024 UTF-8 bytes',
      );
    }
    if (typeof value.error.retriable !== 'boolean') {
      return fail('error.retriable', 'error.retriable must be boolean');
    }
    return { ok: true, value: value as unknown as ToolResultV1<unknown> };
  }

  return fail('ok', 'ok must be boolean');
}

/**
 * Validates the dual-channel MCP response (`structuredContent` + single JSON
 * text block in `content`, `isError === !structuredContent.ok`, packet byte
 * ceiling `maxPacketBytes`, and transport ceiling `<= 2,097,152` UTF-8 bytes).
 */
export function validateMcpToolCallResponseV1(
  toolName: EngramMemoryToolName,
  response: unknown,
  maxPacketBytes: number = MEMORY_MCP_LIMITS.MAX_PACKET_BYTES_DEFAULT,
): SchemaValidationResult<McpToolCallResponseV1<unknown>> {
  if (!isPlainObject(response)) {
    return fail('', 'Expected McpToolCallResponseV1 object');
  }
  const keyErr = checkAllowedKeys(
    response,
    ['isError', 'structuredContent', 'content'],
    '',
  );
  if (keyErr) return keyErr;

  if (typeof response.isError !== 'boolean') {
    return fail('isError', 'isError must be boolean');
  }

  const scRes = validateToolResultV1(toolName, response.structuredContent);
  if (!scRes.ok) return scRes;

  if (response.isError !== !scRes.value.ok) {
    return fail('isError', 'isError must equal !structuredContent.ok');
  }

  if (!Array.isArray(response.content) || response.content.length !== 1) {
    return fail('content', 'content must contain exactly one text block');
  }
  const block = response.content[0];
  if (!isPlainObject(block)) {
    return fail('content[0]', 'Expected text content block');
  }
  const blockKeyErr = checkAllowedKeys(block, ['type', 'text'], 'content[0]');
  if (blockKeyErr) return blockKeyErr;
  if (block.type !== 'text' || typeof block.text !== 'string') {
    return fail(
      'content[0]',
      'content[0] must have type="text" and string text',
    );
  }

  const packetCeiling = Math.min(
    Math.max(maxPacketBytes, MEMORY_MCP_LIMITS.MAX_PACKET_BYTES_MIN),
    MEMORY_MCP_LIMITS.MAX_PACKET_BYTES_MAX,
  );
  const textBytes = utf8ByteLength(block.text);
  if (textBytes > packetCeiling) {
    return fail(
      'content[0].text',
      `Serialized response exceeds packet ceiling of ${packetCeiling} UTF-8 bytes`,
      'RESULT_TOO_LARGE',
    );
  }

  const totalSerializedBytes = utf8ByteLength(JSON.stringify(response));
  if (
    totalSerializedBytes >
    MEMORY_MCP_LIMITS.MAX_TRANSPORT_COMBINED_SERIALIZED_UTF8_BYTES
  ) {
    return fail(
      '',
      `Combined MCP response exceeds ${MEMORY_MCP_LIMITS.MAX_TRANSPORT_COMBINED_SERIALIZED_UTF8_BYTES} UTF-8 bytes`,
      'RESULT_TOO_LARGE',
    );
  }

  let parsedText: unknown;
  try {
    parsedText = JSON.parse(block.text);
  } catch {
    return fail('content[0].text', 'content[0].text is not valid JSON');
  }

  if (
    JSON.stringify(parsedText) !== JSON.stringify(response.structuredContent)
  ) {
    return fail(
      'content[0].text',
      'content[0].text JSON payload must match structuredContent',
    );
  }

  return {
    ok: true,
    value: response as unknown as McpToolCallResponseV1<unknown>,
  };
}

/**
 * M3 Host-managed random pagination handle continuation request and validation.
 *
 * All missing, tampered, expired, raw-engine-cursor, parameter-mismatched, or
 * epoch/policy/trust/expiry-drifted continuation attempts fail closed with
 * `STALE_PAGE`. Every page continuation also requires fresh caller
 * reauthorization (`reauthorized: true`).
 */
export interface PaginationContinuationContextV1 {
  readonly page_cursor: OpaqueRef;
  readonly reauthorized?: boolean;
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
  readonly policy_id: OpaqueRef;
  readonly policy_version: string;
  readonly authorization_epoch: Cursor;
  readonly storage_epoch: Cursor;
  readonly trust_revocation_epoch: Cursor;
  readonly eligibility_digest: Digest;
  readonly now_utc?: Instant;
  readonly current_valid_as_of?: number;
}

export function isRawEngineCursorString(cursor: string): boolean {
  return (
    CURSOR_U64_REGEX.test(cursor) ||
    cursor.startsWith('raw_cursor:') ||
    cursor.startsWith('engine_cursor:') ||
    cursor.startsWith('offset:')
  );
}

export function validatePaginationHandleStateV1(
  state: PaginationHandleStateV1 | undefined | null,
  request: PaginationContinuationContextV1,
  nowUtcOverride?: Instant,
): SchemaValidationResult<PaginationHandleStateV1> {
  if ((request as { reauthorized?: unknown }).reauthorized !== true) {
    return fail(
      'page_cursor',
      'Page continuation requires fresh caller authorization',
      'STALE_PAGE',
    );
  }

  if (
    !isValidOpaqueRef(request.page_cursor) ||
    isRawEngineCursorString(request.page_cursor)
  ) {
    return fail(
      'page_cursor',
      'Malformed or raw engine pagination cursor is rejected',
      'STALE_PAGE',
    );
  }

  if (!state || !isPlainObject(state as unknown)) {
    return fail(
      'page_cursor',
      'Pagination handle was not found in host-managed state',
      'STALE_PAGE',
    );
  }

  if (
    state.engram_owns_signing_secret !== false ||
    !isValidOpaqueRef(state.handle_id) ||
    state.handle_id !== request.page_cursor ||
    !isValidOpaqueRef(state.internal_engine_cursor) ||
    state.handle_id === state.internal_engine_cursor
  ) {
    return fail(
      'page_cursor',
      'Pagination handle state violated host-managed handle invariants',
      'STALE_PAGE',
    );
  }

  const effectiveNowUtc = nowUtcOverride ?? request.now_utc;
  if (
    !effectiveNowUtc ||
    !isValidInstant(effectiveNowUtc) ||
    !isValidInstant(state.issued_at) ||
    !isValidInstant(state.expires_at)
  ) {
    return fail(
      'page_cursor',
      'Pagination handle contains an invalid timestamp',
      'STALE_PAGE',
    );
  }

  const nowMs = Date.parse(effectiveNowUtc);
  const issuedMs = Date.parse(state.issued_at);
  const expiresMs = Date.parse(state.expires_at);

  if (expiresMs <= issuedMs || nowMs < issuedMs || nowMs >= expiresMs) {
    return fail('page_cursor', 'Pagination handle has expired', 'STALE_PAGE');
  }

  if (
    !Number.isSafeInteger(state.valid_as_of) ||
    !isValidCursor(state.system_as_of)
  ) {
    return fail(
      'page_cursor',
      'Pagination handle has invalid snapshot watermarks',
      'STALE_PAGE',
    );
  }

  if (state.next_record_expiry_at !== undefined) {
    if (!isValidInstant(state.next_record_expiry_at)) {
      return fail(
        'page_cursor',
        'Pagination handle has invalid next_record_expiry_at',
        'STALE_PAGE',
      );
    }
    const nextExpiryMs = Date.parse(state.next_record_expiry_at);
    const currentValidAsOf = request.current_valid_as_of ?? nowMs;
    if (
      nowMs >= nextExpiryMs ||
      state.valid_as_of >= nextExpiryMs ||
      currentValidAsOf >= nextExpiryMs
    ) {
      return fail(
        'page_cursor',
        'Pagination handle invalidated by record expiration boundary',
        'STALE_PAGE',
      );
    }
  }

  if (
    state.principal_namespace !== request.principal_namespace ||
    state.tenant_id !== request.tenant_id ||
    state.store_id !== request.store_id ||
    state.connector_instance_id !== request.connector_instance_id ||
    state.scope_ref !== request.scope_ref ||
    state.purpose_ref !== request.purpose_ref ||
    state.query !== request.query ||
    state.query_digest !== request.query_digest ||
    state.limit !== request.limit ||
    state.max_packet_bytes !== request.max_packet_bytes ||
    state.capability_policy.minimum_channels !==
      request.capability_policy.minimum_channels ||
    state.capability_policy.network !== request.capability_policy.network ||
    state.selected_profile !== request.selected_profile ||
    state.profile_version !== request.profile_version ||
    state.policy_id !== request.policy_id ||
    state.policy_version !== request.policy_version ||
    state.authorization_epoch !== request.authorization_epoch ||
    state.storage_epoch !== request.storage_epoch ||
    state.trust_revocation_epoch !== request.trust_revocation_epoch ||
    state.eligibility_digest !== request.eligibility_digest
  ) {
    return fail(
      'page_cursor',
      'Pagination handle binding or epoch mismatch',
      'STALE_PAGE',
    );
  }

  return { ok: true, value: state };
}

export const validatePaginationCursorBindingV1: (
  state: PaginationCursorBindingV1 | undefined | null,
  request: PaginationContinuationContextV1,
  nowUtcOverride?: Instant,
) => SchemaValidationResult<PaginationCursorBindingV1> =
  validatePaginationHandleStateV1;

/**
 * Evaluates a published JSON Schema Draft 2020-12 object structurally using
 * Draft 2020-12 character-count semantics (`minLength`/`maxLength` in Unicode
 * code points `[...str].length`), `pattern`, `minimum`/`maximum`, `minItems`/
 * `maxItems`/`uniqueItems`, `required`, `additionalProperties: false`, `enum`,
 * and `const`.
 *
 * Per SPEC-memory-mcp-v3.1.md §M2 (lines 254–258), structural schema evaluation
 * counts Unicode code points while semantic validation enforces UTF-8 byte budgets.
 */
export function validatePublishedJsonSchemaDraft202012(
  schema: Record<string, unknown>,
  value: unknown,
  path = '',
): SchemaValidationResult<unknown> {
  if ('const' in schema) {
    if (value !== schema.const) {
      return fail(path, `Expected const ${String(schema.const)}`);
    }
  }
  if ('enum' in schema && Array.isArray(schema.enum)) {
    if (!schema.enum.includes(value)) {
      return fail(path, `Value is not in enum [${schema.enum.join(', ')}]`);
    }
  }
  if ('oneOf' in schema && Array.isArray(schema.oneOf)) {
    let matchCount = 0;
    for (const branch of schema.oneOf) {
      if (
        isPlainObject(branch) &&
        validatePublishedJsonSchemaDraft202012(branch, value, path).ok
      ) {
        matchCount++;
      }
    }
    if (matchCount !== 1) {
      return fail(path, `Expected value to match exactly one oneOf branch`);
    }
  }

  const expectedType = schema.type;
  if (expectedType === 'string') {
    if (typeof value !== 'string') {
      return fail(path, 'Expected string');
    }
    const codePointCount = Array.from(value).length;
    if (
      typeof schema.minLength === 'number' &&
      codePointCount < schema.minLength
    ) {
      return fail(
        path,
        `String character length ${codePointCount} is below schema minLength ${schema.minLength}`,
      );
    }
    if (
      typeof schema.maxLength === 'number' &&
      codePointCount > schema.maxLength
    ) {
      return fail(
        path,
        `String character length ${codePointCount} exceeds schema maxLength ${schema.maxLength}`,
      );
    }
    if (typeof schema.pattern === 'string') {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(value)) {
        return fail(path, `String does not match pattern ${schema.pattern}`);
      }
    }
    return { ok: true, value };
  }

  if (expectedType === 'integer' || expectedType === 'number') {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      (expectedType === 'integer' && !Number.isInteger(value))
    ) {
      return fail(path, `Expected ${expectedType}`);
    }
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      return fail(path, `Number ${value} is below minimum ${schema.minimum}`);
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      return fail(path, `Number ${value} exceeds maximum ${schema.maximum}`);
    }
    return { ok: true, value };
  }

  if (expectedType === 'boolean') {
    if (typeof value !== 'boolean') {
      return fail(path, 'Expected boolean');
    }
    return { ok: true, value };
  }

  if (expectedType === 'array') {
    if (!Array.isArray(value)) {
      return fail(path, 'Expected array');
    }
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
      return fail(
        path,
        `Array length ${value.length} is below minItems ${schema.minItems}`,
      );
    }
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
      return fail(
        path,
        `Array length ${value.length} exceeds maxItems ${schema.maxItems}`,
      );
    }
    if (schema.uniqueItems === true) {
      const seen = new Set<string>();
      for (let i = 0; i < value.length; i++) {
        const serializedItem = JSON.stringify(value[i]);
        if (seen.has(serializedItem)) {
          return fail(`${path}[${i}]`, 'Duplicate array item violates uniqueItems');
        }
        seen.add(serializedItem);
      }
    }
    if (isPlainObject(schema.items)) {
      for (let i = 0; i < value.length; i++) {
        const itemRes = validatePublishedJsonSchemaDraft202012(
          schema.items,
          value[i],
          `${path}[${i}]`,
        );
        if (!itemRes.ok) return itemRes;
      }
    }
    return { ok: true, value };
  }

  if (expectedType === 'object') {
    if (!isPlainObject(value)) {
      return fail(path, 'Expected plain object');
    }
    const properties = isPlainObject(schema.properties)
      ? schema.properties
      : {};
    const required = Array.isArray(schema.required)
      ? (schema.required as string[])
      : [];

    for (const reqKey of required) {
      if (!Object.hasOwn(value, reqKey) || value[reqKey] === undefined) {
        const fieldPath = path ? `${path}.${reqKey}` : reqKey;
        return fail(fieldPath, `Missing required property '${reqKey}'`);
      }
    }

    for (const key of Object.keys(value)) {
      const fieldPath = path ? `${path}.${key}` : key;
      if (value[key] === undefined) {
        return fail(fieldPath, `Property '${key}' must not be undefined`);
      }
      if (value[key] === null) {
        return fail(fieldPath, `Property '${key}' must not be null`);
      }
      if (!Object.hasOwn(properties, key)) {
        if (schema.additionalProperties === false) {
          return fail(
            fieldPath,
            `Unexpected property '${key}' is forbidden by additionalProperties: false`,
          );
        }
        continue;
      }
      const propSchema = properties[key];
      if (isPlainObject(propSchema)) {
        const propRes = validatePublishedJsonSchemaDraft202012(
          propSchema,
          value[key],
          fieldPath,
        );
        if (!propRes.ok) return propRes;
      }
    }
    return { ok: true, value };
  }

  return { ok: true, value };
}

// ============================================================================
// 11. L0-A04 Versioned Memory Wire & Tool-Schema Profile
// ============================================================================

export const MEMORY_MCP_WIRE_PROFILE_ID_V1 =
  'sentropic.engram.memory-wire/v1' as const;

export const MEMORY_MCP_TOOL_SCHEMA_PROFILE_ID_V1 =
  'sentropic.engram.memory-tools/2020-12-v1' as const;

export const MEMORY_MCP_JSON_SCHEMA_DIALECT_V1 =
  'https://json-schema.org/draft/2020-12/schema' as const;

export interface MemoryMcpWireProfileV1 {
  readonly wireProfileId: typeof MEMORY_MCP_WIRE_PROFILE_ID_V1;
  readonly schemaProfileId: typeof MEMORY_MCP_TOOL_SCHEMA_PROFILE_ID_V1;
  readonly jsonSchemaDialect: typeof MEMORY_MCP_JSON_SCHEMA_DIALECT_V1;
  readonly allowedAssertionKeywords: readonly [
    'type',
    'properties',
    'required',
    'additionalProperties',
    'items',
    'minItems',
    'maxItems',
    'uniqueItems',
    'enum',
    'const',
    'minLength',
    'maxLength',
    'minimum',
    'maximum',
    'pattern',
    'oneOf',
  ];
  readonly allowedAnnotationKeywords: readonly [
    '$schema',
    '$id',
    'title',
    'description',
    'default',
  ];
  readonly forbidRefAndRemoteResolution: true;
  readonly forbidCoercionAndExecutableDefaults: true;
  readonly requireAdditionalPropertiesFalseOnObjects: true;
  readonly requireSemanticUtf8ByteValidation: true;
  readonly maxPacketBytesDefault: 65536;
  readonly maxPacketBytesMax: 1048576;
  readonly combinedTransportCeilingUtf8Bytes: 2097152;
  readonly mcpSdkMinVersion: '1.31.0';
  readonly preserveImmoGlobalDefaultCodec: true;
  readonly configurationBoundedProfileId: 'sentropic.parameters/2020-12-bounded-v1';
  readonly configurationBoundedProfileQualifiesMemoryDtos: false;
  readonly runtimeCodecQualificationStatus: 'unverified';
}

export const ENGRAM_MEMORY_WIRE_PROFILE_V1: MemoryMcpWireProfileV1 = Object.freeze({
  wireProfileId: MEMORY_MCP_WIRE_PROFILE_ID_V1,
  schemaProfileId: MEMORY_MCP_TOOL_SCHEMA_PROFILE_ID_V1,
  jsonSchemaDialect: MEMORY_MCP_JSON_SCHEMA_DIALECT_V1,
  allowedAssertionKeywords: Object.freeze([
    'type',
    'properties',
    'required',
    'additionalProperties',
    'items',
    'minItems',
    'maxItems',
    'uniqueItems',
    'enum',
    'const',
    'minLength',
    'maxLength',
    'minimum',
    'maximum',
    'pattern',
    'oneOf',
  ] as const),
  allowedAnnotationKeywords: Object.freeze([
    '$schema',
    '$id',
    'title',
    'description',
    'default',
  ] as const),
  forbidRefAndRemoteResolution: true,
  forbidCoercionAndExecutableDefaults: true,
  requireAdditionalPropertiesFalseOnObjects: true,
  requireSemanticUtf8ByteValidation: true,
  maxPacketBytesDefault: 65536,
  maxPacketBytesMax: 1048576,
  combinedTransportCeilingUtf8Bytes: 2097152,
  mcpSdkMinVersion: '1.31.0',
  preserveImmoGlobalDefaultCodec: true,
  configurationBoundedProfileId: 'sentropic.parameters/2020-12-bounded-v1',
  configurationBoundedProfileQualifiesMemoryDtos: false,
  runtimeCodecQualificationStatus: 'unverified',
});

const ALLOWED_DIALECT_KEYWORDS_SET = new Set<string>([
  ...ENGRAM_MEMORY_WIRE_PROFILE_V1.allowedAssertionKeywords,
  ...ENGRAM_MEMORY_WIRE_PROFILE_V1.allowedAnnotationKeywords,
]);

/**
 * Validates that a JSON Schema asset conforms to the closed L0-A04
 * `sentropic.engram.memory-tools/2020-12-v1` dialect and rejects unknown
 * assertion keywords (`$ref`, `anyOf`, `not`, `patternProperties`, etc.),
 * unclosed objects (`additionalProperties !== false`), or unsupported
 * wire/schema profile identifiers.
 */
export function validateMemoryToolSchemaDialectV1(
  schema: unknown,
  options?: {
    readonly wireProfileId?: string;
    readonly schemaProfileId?: string;
  },
  path = '$',
): SchemaValidationResult<Record<string, unknown>> {
  if (
    options?.wireProfileId !== undefined &&
    options.wireProfileId !== ENGRAM_MEMORY_WIRE_PROFILE_V1.wireProfileId
  ) {
    return fail(
      'wireProfileId',
      `Unsupported wire profile '${options.wireProfileId}'; expected '${ENGRAM_MEMORY_WIRE_PROFILE_V1.wireProfileId}'`,
    );
  }
  if (
    options?.schemaProfileId !== undefined &&
    options.schemaProfileId !== ENGRAM_MEMORY_WIRE_PROFILE_V1.schemaProfileId
  ) {
    return fail(
      'schemaProfileId',
      `Unsupported tool-schema profile '${options.schemaProfileId}'; expected '${ENGRAM_MEMORY_WIRE_PROFILE_V1.schemaProfileId}'`,
    );
  }
  if (!isPlainObject(schema)) {
    return fail(path, 'Schema node must be a plain object');
  }
  if (
    path === '$' &&
    '$schema' in schema &&
    schema.$schema !== ENGRAM_MEMORY_WIRE_PROFILE_V1.jsonSchemaDialect
  ) {
    return fail(
      `${path}.$schema`,
      `Schema $schema must equal '${ENGRAM_MEMORY_WIRE_PROFILE_V1.jsonSchemaDialect}'`,
    );
  }

  for (const key of Object.keys(schema)) {
    if (!ALLOWED_DIALECT_KEYWORDS_SET.has(key)) {
      return fail(
        `${path}.${key}`,
        `Keyword '${key}' is forbidden by '${ENGRAM_MEMORY_WIRE_PROFILE_V1.schemaProfileId}'`,
      );
    }
  }

  if (schema.type === 'object' || 'properties' in schema) {
    if (schema.additionalProperties !== false) {
      return fail(
        `${path}.additionalProperties`,
        'Object schema must set additionalProperties: false',
      );
    }
    if (schema.properties !== undefined) {
      if (!isPlainObject(schema.properties)) {
        return fail(`${path}.properties`, 'properties must be a plain object');
      }
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        const sub = validateMemoryToolSchemaDialectV1(
          propSchema,
          undefined,
          `${path}.properties.${propName}`,
        );
        if (!sub.ok) return sub;
      }
    }
  }

  if ('items' in schema) {
    const sub = validateMemoryToolSchemaDialectV1(
      schema.items,
      undefined,
      `${path}.items`,
    );
    if (!sub.ok) return sub;
  }

  if ('oneOf' in schema) {
    if (!Array.isArray(schema.oneOf) || schema.oneOf.length === 0) {
      return fail(`${path}.oneOf`, 'oneOf must be a non-empty array of schemas');
    }
    for (let i = 0; i < schema.oneOf.length; i++) {
      const sub = validateMemoryToolSchemaDialectV1(
        schema.oneOf[i],
        undefined,
        `${path}.oneOf[${i}]`,
      );
      if (!sub.ok) return sub;
    }
  }

  return { ok: true, value: schema };
}

export { DISCLOSABLE_MEMORY_STATES, ENGRAM_MEMORY_TOOL_NAMES };
