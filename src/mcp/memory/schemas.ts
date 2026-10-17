/**
 * MCP-L0 Closed JSON Schemas and Deterministic Validators for Engram Memory Tools.
 *
 * Every input and output schema sets `additionalProperties: false` at every
 * object boundary. Optional properties must be omitted rather than set to `null`.
 */

import {
  ENGRAM_MEMORY_SCHEMA_VERSION,
  ENGRAM_MEMORY_TOOL_NAMES,
  EVIDENCE_MEDIA_TYPES,
  MEMORY_KINDS,
  MEMORY_MCP_LIMITS,
  MEMORY_STATUSES,
  READ_OUTCOMES,
  RECALL_STATUS_FILTERS,
  REDACTION_STATES,
  RETENTION_OUTCOMES,
  RETRIEVAL_STATUSES,
  SCOPE_LEVELS,
  SENSITIVITY_LABELS,
  SHARING_POLICIES,
  SOURCE_CLASSES,
  type AdmissibilityAssessmentV1,
  type CaptureInputV1,
  type CaptureOutputV1,
  type EngramMemoryToolName,
  type EvidenceCitationV1,
  type ForgetInputV1,
  type ForgetOutputV1,
  type GetInputV1,
  type GetOutputV1,
  type McpToolCallResponseV1,
  type MemoryReadReceiptV1,
  type PaginationCursorBindingV1,
  type PrincipalRefV1,
  type PublicMemoryErrorCode,
  type RecallOrderingV1,
  type RecallRecordPacketV3,
  type RedactedMemoryRecordV2,
  type RequestAdmissionInputV1,
  type RequestAdmissionOutputV1,
  type ScopeRefV1,
  type SearchInputV1,
  type SearchOutputV1,
  type SourceProvenanceV1,
  type ToolResultV1,
  type WithdrawInputV1,
  type WithdrawOutputV1,
} from './contracts.js';

const ISO_UTC_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const SHA256_DIGEST_REGEX = /^sha256:[0-9a-f]{64}$/;
const STRUCTURED_ATTR_KEY_REGEX = /^[A-Za-z0-9_.-]{1,64}$/;

export const PUBLIC_MEMORY_ERROR_CODES: readonly PublicMemoryErrorCode[] = [
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
  'RESULT_TOO_LARGE',
  'RATE_LIMITED',
  'MUTATION_OUTCOME_UNKNOWN',
  'gate_failed',
] as const;

export const PRINCIPAL_REF_V1_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['schema_version', 'principal_id', 'principal_kind', 'tenant_id', 'roles'],
  properties: {
    schema_version: { const: ENGRAM_MEMORY_SCHEMA_VERSION },
    principal_id: { type: 'string', minLength: 1, maxLength: 128 },
    principal_kind: { enum: ['user', 'agent', 'service', 'system'] },
    tenant_id: { type: 'string', minLength: 1, maxLength: 128 },
    roles: {
      type: 'array',
      items: { type: 'string', minLength: 1, maxLength: 64 },
    },
  },
} as const;

export const SCOPE_REF_V1_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['schema_version', 'tenant_id', 'workspace_id', 'project_id', 'level'],
  properties: {
    schema_version: { const: ENGRAM_MEMORY_SCHEMA_VERSION },
    tenant_id: { type: 'string', minLength: 1, maxLength: 128 },
    workspace_id: { type: 'string', minLength: 1, maxLength: 128 },
    project_id: { type: 'string', minLength: 1, maxLength: 128 },
    level: { enum: [...SCOPE_LEVELS] },
    session_id: { type: 'string', minLength: 1, maxLength: 128 },
    user_id: { type: 'string', minLength: 1, maxLength: 128 },
  },
} as const;

export const EVIDENCE_CITATION_V1_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'schema_version',
    'citation_id',
    'locator',
    'digest',
    'media_type',
    'observed_at_utc',
  ],
  properties: {
    schema_version: { const: ENGRAM_MEMORY_SCHEMA_VERSION },
    citation_id: { type: 'string', minLength: 1, maxLength: 128 },
    locator: { type: 'string', minLength: 1, maxLength: 512 },
    digest: { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' },
    media_type: { enum: [...EVIDENCE_MEDIA_TYPES] },
    observed_at_utc: { type: 'string', pattern: ISO_UTC_REGEX.source },
    byte_range: {
      type: 'object',
      additionalProperties: false,
      required: ['start_byte', 'end_byte_exclusive'],
      properties: {
        start_byte: { type: 'integer', minimum: 0 },
        end_byte_exclusive: { type: 'integer', minimum: 1 },
      },
    },
    line_range: {
      type: 'object',
      additionalProperties: false,
      required: ['start_line', 'end_line_inclusive'],
      properties: {
        start_line: { type: 'integer', minimum: 1 },
        end_line_inclusive: { type: 'integer', minimum: 1 },
      },
    },
    excerpt: { type: 'string', maxLength: 512 },
  },
} as const;

export const SOURCE_PROVENANCE_V1_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'schema_version',
    'source_class',
    'captured_by',
    'observed_at_utc',
    'citations',
  ],
  properties: {
    schema_version: { const: ENGRAM_MEMORY_SCHEMA_VERSION },
    source_class: { enum: [...SOURCE_CLASSES] },
    captured_by: PRINCIPAL_REF_V1_SCHEMA,
    observed_at_utc: { type: 'string', pattern: ISO_UTC_REGEX.source },
    citations: {
      type: 'array',
      minItems: 1,
      maxItems: 16,
      items: EVIDENCE_CITATION_V1_SCHEMA,
    },
    upstream_bundle_id: { type: 'string', minLength: 1, maxLength: 128 },
    external_origin_ref: { type: 'string', minLength: 1, maxLength: 512 },
  },
} as const;

export const STRUCTURED_ATTRIBUTES_SCHEMA = {
  type: 'object',
  maxProperties: 32,
  propertyNames: {
    type: 'string',
    minLength: 1,
    maxLength: 64,
    pattern: '^[A-Za-z0-9_.-]{1,64}$',
  },
  additionalProperties: {
    type: ['string', 'number', 'boolean', 'null'],
  },
} as const;

export const REDACTED_MEMORY_RECORD_V2_JSON_SCHEMA = {
  $id: 'https://engram.dev/schemas/memory/v1/RedactedMemoryRecordV2.json',
  type: 'object',
  additionalProperties: false,
  required: [
    'schema_version',
    'memory_id',
    'scope_ref',
    'memory_kind',
    'status',
    'summary',
    'content_digest',
    'sensitivity',
    'source_class',
    'citations',
    'redaction_state',
    'redacted_fields',
    'admitted_at_utc',
    'supersedes_ids',
    'active_dispute_ids',
  ],
  properties: {
    schema_version: { const: ENGRAM_MEMORY_SCHEMA_VERSION },
    memory_id: { type: 'string', minLength: 1, maxLength: 128 },
    scope_ref: SCOPE_REF_V1_SCHEMA,
    memory_kind: { enum: [...MEMORY_KINDS] },
    status: { enum: [...RETRIEVAL_STATUSES] },
    summary: { type: 'string', minLength: 1, maxLength: 512 },
    statement: { type: 'string', minLength: 1, maxLength: 8192 },
    structured_attributes: STRUCTURED_ATTRIBUTES_SCHEMA,
    content_digest: { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' },
    sensitivity: { enum: [...SENSITIVITY_LABELS] },
    source_class: { enum: [...SOURCE_CLASSES] },
    citations: {
      type: 'array',
      minItems: 1,
      maxItems: 16,
      items: EVIDENCE_CITATION_V1_SCHEMA,
    },
    redaction_state: { enum: [...REDACTION_STATES] },
    redacted_fields: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
    },
    admitted_at_utc: { type: 'string', pattern: ISO_UTC_REGEX.source },
    supersedes_ids: {
      type: 'array',
      items: { type: 'string', minLength: 1, maxLength: 128 },
    },
    active_dispute_ids: {
      type: 'array',
      items: { type: 'string', minLength: 1, maxLength: 128 },
    },
  },
} as const;

export const ENGRAM_MEMORY_SEARCH_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['query_text'],
  properties: {
    query_text: {
      type: 'string',
      minLength: MEMORY_MCP_LIMITS.SEARCH_QUERY_TEXT_MIN_CHARS,
      maxLength: MEMORY_MCP_LIMITS.SEARCH_QUERY_TEXT_MAX_CHARS,
    },
    memory_kinds: {
      type: 'array',
      minItems: MEMORY_MCP_LIMITS.SEARCH_MEMORY_KINDS_MIN_ITEMS,
      maxItems: MEMORY_MCP_LIMITS.SEARCH_MEMORY_KINDS_MAX_ITEMS,
      uniqueItems: true,
      items: {
        enum: [...MEMORY_KINDS],
      },
    },
    status_filter: {
      enum: [...RECALL_STATUS_FILTERS],
    },
    limit: {
      type: 'integer',
      minimum: MEMORY_MCP_LIMITS.SEARCH_LIMIT_MIN,
      maximum: MEMORY_MCP_LIMITS.SEARCH_LIMIT_MAX,
      default: MEMORY_MCP_LIMITS.SEARCH_LIMIT_DEFAULT,
    },
    cursor: {
      type: 'string',
      minLength: MEMORY_MCP_LIMITS.SEARCH_CURSOR_MIN_CHARS,
      maxLength: MEMORY_MCP_LIMITS.SEARCH_CURSOR_MAX_CHARS,
    },
  },
} as const;

export const ENGRAM_MEMORY_GET_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['memory_ids'],
  properties: {
    memory_ids: {
      type: 'array',
      minItems: MEMORY_MCP_LIMITS.GET_MEMORY_IDS_MIN_ITEMS,
      maxItems: MEMORY_MCP_LIMITS.GET_MEMORY_IDS_MAX_ITEMS,
      uniqueItems: true,
      items: {
        type: 'string',
        minLength: MEMORY_MCP_LIMITS.OPAQUE_ID_MIN_CHARS,
        maxLength: MEMORY_MCP_LIMITS.OPAQUE_ID_MAX_CHARS,
      },
    },
  },
} as const;

export const ENGRAM_MEMORY_CAPTURE_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['idempotency_key', 'memory_kind', 'payload', 'provenance'],
  properties: {
    idempotency_key: { type: 'string', minLength: 1, maxLength: 128 },
    memory_kind: { enum: [...MEMORY_KINDS] },
    payload: {
      type: 'object',
      additionalProperties: false,
      required: ['summary', 'statement'],
      properties: {
        summary: { type: 'string', minLength: 1, maxLength: 512 },
        statement: { type: 'string', minLength: 1, maxLength: 8192 },
        structured_attributes: STRUCTURED_ATTRIBUTES_SCHEMA,
      },
    },
    provenance: SOURCE_PROVENANCE_V1_SCHEMA,
    sensitivity: { enum: [...SENSITIVITY_LABELS] },
    sharing_policy: { enum: [...SHARING_POLICIES] },
    retention_hint: {
      type: 'object',
      additionalProperties: false,
      properties: {
        expires_at_utc: { type: 'string', pattern: ISO_UTC_REGEX.source },
        expiry_outcome: { enum: [...RETENTION_OUTCOMES] },
      },
    },
    reconciliation_hint: {
      type: 'object',
      additionalProperties: false,
      required: ['family_refs'],
      properties: {
        family_refs: {
          type: 'array',
          minItems: MEMORY_MCP_LIMITS.RECONCILIATION_FAMILY_REFS_MIN_ITEMS,
          maxItems: MEMORY_MCP_LIMITS.RECONCILIATION_FAMILY_REFS_MAX_ITEMS,
          uniqueItems: true,
          items: { type: 'string', minLength: 1, maxLength: 128 },
        },
      },
    },
  },
} as const;

export const ENGRAM_MEMORY_REQUEST_ADMISSION_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['idempotency_key', 'memory_id', 'rationale_code'],
  properties: {
    idempotency_key: { type: 'string', minLength: 1, maxLength: 128 },
    memory_id: { type: 'string', minLength: 1, maxLength: 128 },
    rationale_code: { type: 'string', minLength: 1, maxLength: 128 },
  },
} as const;

export const ENGRAM_MEMORY_WITHDRAW_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['idempotency_key', 'memory_id', 'reason_code'],
  properties: {
    idempotency_key: { type: 'string', minLength: 1, maxLength: 128 },
    memory_id: { type: 'string', minLength: 1, maxLength: 128 },
    reason_code: { type: 'string', minLength: 1, maxLength: 128 },
  },
} as const;

export const ENGRAM_MEMORY_FORGET_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['idempotency_key', 'memory_id', 'reason_code'],
  properties: {
    idempotency_key: { type: 'string', minLength: 1, maxLength: 128 },
    memory_id: { type: 'string', minLength: 1, maxLength: 128 },
    reason_code: { type: 'string', minLength: 1, maxLength: 128 },
  },
} as const;

function buildToolResultEnvelopeSchema(
  toolName: EngramMemoryToolName,
  resultSchema: Record<string, unknown>,
) {
  return {
    oneOf: [
      {
        type: 'object',
        additionalProperties: false,
        required: ['ok', 'schema_version', 'tool', 'result'],
        properties: {
          ok: { const: true },
          schema_version: { const: ENGRAM_MEMORY_SCHEMA_VERSION },
          tool: { const: toolName },
          result: resultSchema,
        },
      },
      {
        type: 'object',
        additionalProperties: false,
        required: ['ok', 'schema_version', 'tool', 'error'],
        properties: {
          ok: { const: false },
          schema_version: { const: ENGRAM_MEMORY_SCHEMA_VERSION },
          tool: { const: toolName },
          error: {
            type: 'object',
            additionalProperties: false,
            required: ['code', 'message', 'retryable'],
            properties: {
              code: { enum: [...PUBLIC_MEMORY_ERROR_CODES] },
              message: { type: 'string', minLength: 1, maxLength: 1024 },
              retryable: { type: 'boolean' },
              details: {
                type: 'object',
                additionalProperties: {
                  type: ['string', 'number', 'boolean', 'null'],
                },
              },
            },
          },
        },
      },
    ],
  } as const;
}

export const SEARCH_RESULT_PAYLOAD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'schema_version',
    'packet_id',
    'query_id',
    'scope_ref',
    'status_filter',
    'ordering',
    'generated_at_utc',
    'records',
    'withheld_count',
    'page',
  ],
  properties: {
    schema_version: { const: ENGRAM_MEMORY_SCHEMA_VERSION },
    packet_id: { type: 'string', minLength: 1, maxLength: 128 },
    query_id: { type: 'string', minLength: 1, maxLength: 128 },
    scope_ref: SCOPE_REF_V1_SCHEMA,
    status_filter: { enum: [...RECALL_STATUS_FILTERS] },
    ordering: {
      type: 'object',
      additionalProperties: false,
      required: ['primary', 'secondary', 'tertiary'],
      properties: {
        primary: { const: 'relevance_score_bps_desc' },
        secondary: { const: 'admitted_at_utc_desc' },
        tertiary: { const: 'memory_id_asc' },
      },
    },
    generated_at_utc: { type: 'string', pattern: ISO_UTC_REGEX.source },
    records: {
      type: 'array',
      maxItems: MEMORY_MCP_LIMITS.SEARCH_LIMIT_MAX,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['rank', 'relevance_score_bps', 'record'],
        properties: {
          rank: { type: 'integer', minimum: 1 },
          relevance_score_bps: { type: 'integer', minimum: 0, maximum: 10000 },
          record: REDACTED_MEMORY_RECORD_V2_JSON_SCHEMA,
        },
      },
    },
    withheld_count: { type: 'integer', minimum: 0 },
    page: {
      type: 'object',
      additionalProperties: false,
      required: ['returned_count', 'has_more'],
      properties: {
        returned_count: {
          type: 'integer',
          minimum: 0,
          maximum: MEMORY_MCP_LIMITS.SEARCH_LIMIT_MAX,
        },
        has_more: { type: 'boolean' },
        next_cursor: { type: 'string', minLength: 1, maxLength: 512 },
      },
    },
  },
} as const;

export const GET_RESULT_PAYLOAD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'schema_version',
    'packet_id',
    'scope_ref',
    'generated_at_utc',
    'results',
  ],
  properties: {
    schema_version: { const: ENGRAM_MEMORY_SCHEMA_VERSION },
    packet_id: { type: 'string', minLength: 1, maxLength: 128 },
    scope_ref: SCOPE_REF_V1_SCHEMA,
    generated_at_utc: { type: 'string', pattern: ISO_UTC_REGEX.source },
    results: {
      type: 'array',
      minItems: MEMORY_MCP_LIMITS.GET_MEMORY_IDS_MIN_ITEMS,
      maxItems: MEMORY_MCP_LIMITS.GET_MEMORY_IDS_MAX_ITEMS,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['memory_id', 'outcome', 'reason_codes'],
        properties: {
          memory_id: { type: 'string', minLength: 1, maxLength: 128 },
          outcome: { enum: [...READ_OUTCOMES] },
          status: { enum: [...MEMORY_STATUSES] },
          record: REDACTED_MEMORY_RECORD_V2_JSON_SCHEMA,
          reason_codes: {
            type: 'array',
            items: { type: 'string', minLength: 1, maxLength: 128 },
          },
        },
      },
    },
  },
} as const;

export const CAPTURE_RESULT_PAYLOAD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'schema_version',
    'memory_id',
    'status',
    'content_digest',
    'captured_at_utc',
    'event_id',
    'idempotent_replay',
  ],
  properties: {
    schema_version: { const: ENGRAM_MEMORY_SCHEMA_VERSION },
    memory_id: { type: 'string', minLength: 1, maxLength: 128 },
    status: { enum: ['candidate', 'quarantined'] },
    content_digest: { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' },
    captured_at_utc: { type: 'string', pattern: ISO_UTC_REGEX.source },
    event_id: { type: 'string', minLength: 1, maxLength: 128 },
    idempotent_replay: { type: 'boolean' },
    quarantine_reason_codes: {
      type: 'array',
      items: { type: 'string', minLength: 1, maxLength: 128 },
    },
  },
} as const;

export const ADMISSIBILITY_ASSESSMENT_V1_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'schema_version',
    'policy_id',
    'policy_version',
    'admissible',
    'confidence_bps',
    'assessed_at_utc',
    'assessed_by',
    'reason_codes',
    'required_corroboration_count',
    'observed_corroboration_count',
  ],
  properties: {
    schema_version: { const: ENGRAM_MEMORY_SCHEMA_VERSION },
    policy_id: { type: 'string', minLength: 1, maxLength: 128 },
    policy_version: { type: 'string', minLength: 1, maxLength: 64 },
    admissible: { type: 'boolean' },
    confidence_bps: { type: 'integer', minimum: 0, maximum: 10000 },
    assessed_at_utc: { type: 'string', pattern: ISO_UTC_REGEX.source },
    assessed_by: PRINCIPAL_REF_V1_SCHEMA,
    reason_codes: {
      type: 'array',
      items: { type: 'string', minLength: 1, maxLength: 128 },
    },
    required_corroboration_count: { type: 'integer', minimum: 0 },
    observed_corroboration_count: { type: 'integer', minimum: 0 },
  },
} as const;

export const REQUEST_ADMISSION_RESULT_PAYLOAD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'schema_version',
    'memory_id',
    'outcome',
    'resulting_status',
    'decided_at_utc',
    'assessment',
    'idempotent_replay',
  ],
  properties: {
    schema_version: { const: ENGRAM_MEMORY_SCHEMA_VERSION },
    memory_id: { type: 'string', minLength: 1, maxLength: 128 },
    outcome: { enum: ['admitted', 'quarantined', 'rejected'] },
    resulting_status: { enum: ['admitted', 'quarantined', 'candidate'] },
    decided_at_utc: { type: 'string', pattern: ISO_UTC_REGEX.source },
    assessment: ADMISSIBILITY_ASSESSMENT_V1_SCHEMA,
    idempotent_replay: { type: 'boolean' },
    event_id: { type: 'string', minLength: 1, maxLength: 128 },
  },
} as const;

export const WITHDRAW_RESULT_PAYLOAD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'schema_version',
    'memory_id',
    'previous_status',
    'status',
    'withdrawn_at_utc',
    'event_id',
    'idempotent_replay',
  ],
  properties: {
    schema_version: { const: ENGRAM_MEMORY_SCHEMA_VERSION },
    memory_id: { type: 'string', minLength: 1, maxLength: 128 },
    previous_status: {
      enum: ['candidate', 'quarantined', 'admitted', 'disputed'],
    },
    status: { const: 'withdrawn' },
    withdrawn_at_utc: { type: 'string', pattern: ISO_UTC_REGEX.source },
    event_id: { type: 'string', minLength: 1, maxLength: 128 },
    idempotent_replay: { type: 'boolean' },
  },
} as const;

export const FORGET_RESULT_PAYLOAD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'schema_version',
    'memory_id',
    'tombstone_id',
    'erased_at_utc',
    'event_id',
    'erased_artifact_digests',
    'destroyed_key_ids',
    'idempotent_replay',
  ],
  properties: {
    schema_version: { const: ENGRAM_MEMORY_SCHEMA_VERSION },
    memory_id: { type: 'string', minLength: 1, maxLength: 128 },
    tombstone_id: { type: 'string', minLength: 1, maxLength: 128 },
    erased_at_utc: { type: 'string', pattern: ISO_UTC_REGEX.source },
    event_id: { type: 'string', minLength: 1, maxLength: 128 },
    erased_artifact_digests: {
      type: 'array',
      items: { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' },
    },
    destroyed_key_ids: {
      type: 'array',
      items: { type: 'string', minLength: 1, maxLength: 128 },
    },
    idempotent_replay: { type: 'boolean' },
  },
} as const;

export const ENGRAM_MEMORY_SEARCH_OUTPUT_SCHEMA = buildToolResultEnvelopeSchema(
  'engram_memory_search',
  SEARCH_RESULT_PAYLOAD_SCHEMA,
);
export const ENGRAM_MEMORY_GET_OUTPUT_SCHEMA = buildToolResultEnvelopeSchema(
  'engram_memory_get',
  GET_RESULT_PAYLOAD_SCHEMA,
);
export const ENGRAM_MEMORY_CAPTURE_OUTPUT_SCHEMA =
  buildToolResultEnvelopeSchema(
    'engram_memory_capture',
    CAPTURE_RESULT_PAYLOAD_SCHEMA,
  );
export const ENGRAM_MEMORY_REQUEST_ADMISSION_OUTPUT_SCHEMA =
  buildToolResultEnvelopeSchema(
    'engram_memory_request_admission',
    REQUEST_ADMISSION_RESULT_PAYLOAD_SCHEMA,
  );
export const ENGRAM_MEMORY_WITHDRAW_OUTPUT_SCHEMA =
  buildToolResultEnvelopeSchema(
    'engram_memory_withdraw',
    WITHDRAW_RESULT_PAYLOAD_SCHEMA,
  );
export const ENGRAM_MEMORY_FORGET_OUTPUT_SCHEMA = buildToolResultEnvelopeSchema(
  'engram_memory_forget',
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
  readonly code:
    | 'INVALID_SCHEMA'
    | 'UNSUPPORTED_SCHEMA_VERSION'
    | 'INVALID_TIMESTAMP'
    | 'INVALID_DIGEST'
    | 'RESULT_TOO_LARGE';
  readonly field: string;
  readonly message: string;
}

export type SchemaValidationResult<T> =
  | SchemaValidationSuccess<T>
  | SchemaValidationFailure;

function fail(
  field: string,
  message: string,
  code: SchemaValidationFailure['code'] = 'INVALID_SCHEMA',
): SchemaValidationFailure {
  return { ok: false, code, field, message };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function checkAllowedKeys(
  obj: Record<string, unknown>,
  allowedKeys: readonly string[],
  path: string,
): SchemaValidationFailure | null {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      return fail(
        path ? `${path}.${key}` : key,
        `Unexpected property '${key}' is not permitted by closed schema`,
      );
    }
    if (obj[key] === undefined) {
      return fail(
        path ? `${path}.${key}` : key,
        `Optional property '${key}' must be omitted rather than set to undefined`,
      );
    }
  }
  return null;
}

function utf8Bytes(str: string): number {
  return Buffer.byteLength(str, 'utf8');
}

export function isValidIsoUtcTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_UTC_REGEX.test(value)) {
    return false;
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return false;
  }
  const y = Number(value.slice(0, 4));
  const m = Number(value.slice(5, 7));
  const d = Number(value.slice(8, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export function isValidSha256Digest(value: unknown): value is string {
  return typeof value === 'string' && SHA256_DIGEST_REGEX.test(value);
}

function validateOpaqueId(
  value: unknown,
  field: string,
  maxLen: number = MEMORY_MCP_LIMITS.OPAQUE_ID_MAX_CHARS,
): SchemaValidationFailure | null {
  if (typeof value !== 'string' || value.length < 1 || value.length > maxLen) {
    return fail(field, `Expected string of length 1..${maxLen}`);
  }
  return null;
}

function validateSchemaVersionField(
  value: unknown,
  field: string,
): SchemaValidationFailure | null {
  if (typeof value !== 'string') {
    return fail(field, 'Expected schema_version string');
  }
  if (value !== ENGRAM_MEMORY_SCHEMA_VERSION) {
    return fail(
      field,
      `Unsupported schema_version '${value}'`,
      'UNSUPPORTED_SCHEMA_VERSION',
    );
  }
  return null;
}

function validateTimestampField(
  value: unknown,
  field: string,
): SchemaValidationFailure | null {
  if (typeof value !== 'string') {
    return fail(field, 'Expected ISO-8601 UTC timestamp string');
  }
  if (!isValidIsoUtcTimestamp(value)) {
    return fail(
      field,
      `Invalid ISO-8601 UTC timestamp '${value}'`,
      'INVALID_TIMESTAMP',
    );
  }
  return null;
}

function validateDigestField(
  value: unknown,
  field: string,
): SchemaValidationFailure | null {
  if (typeof value !== 'string') {
    return fail(field, 'Expected sha256 digest string');
  }
  if (!isValidSha256Digest(value)) {
    return fail(field, `Invalid SHA-256 digest '${value}'`, 'INVALID_DIGEST');
  }
  return null;
}

export function validateScopeRefV1(
  value: unknown,
  path = 'scope_ref',
): SchemaValidationResult<ScopeRefV1> {
  if (!isPlainObject(value)) {
    return fail(path, 'Expected ScopeRefV1 object');
  }
  const keyErr = checkAllowedKeys(
    value,
    [
      'schema_version',
      'tenant_id',
      'workspace_id',
      'project_id',
      'level',
      'session_id',
      'user_id',
    ],
    path,
  );
  if (keyErr) return keyErr;

  const verErr = validateSchemaVersionField(
    value.schema_version,
    `${path}.schema_version`,
  );
  if (verErr) return verErr;

  for (const k of ['tenant_id', 'workspace_id', 'project_id'] as const) {
    const err = validateOpaqueId(value[k], `${path}.${k}`);
    if (err) return err;
  }

  if (
    typeof value.level !== 'string' ||
    !(SCOPE_LEVELS as readonly string[]).includes(value.level)
  ) {
    return fail(`${path}.level`, 'Invalid scope level');
  }

  if ('session_id' in value) {
    const err = validateOpaqueId(value.session_id, `${path}.session_id`);
    if (err) return err;
  }
  if ('user_id' in value) {
    const err = validateOpaqueId(value.user_id, `${path}.user_id`);
    if (err) return err;
  }

  return { ok: true, value: value as unknown as ScopeRefV1 };
}

export function validatePrincipalRefV1(
  value: unknown,
  path = 'principal_ref',
): SchemaValidationResult<PrincipalRefV1> {
  if (!isPlainObject(value)) {
    return fail(path, 'Expected PrincipalRefV1 object');
  }
  const keyErr = checkAllowedKeys(
    value,
    ['schema_version', 'principal_id', 'principal_kind', 'tenant_id', 'roles'],
    path,
  );
  if (keyErr) return keyErr;

  const verErr = validateSchemaVersionField(
    value.schema_version,
    `${path}.schema_version`,
  );
  if (verErr) return verErr;

  const idErr = validateOpaqueId(value.principal_id, `${path}.principal_id`);
  if (idErr) return idErr;

  if (
    typeof value.principal_kind !== 'string' ||
    !['user', 'agent', 'service', 'system'].includes(value.principal_kind)
  ) {
    return fail(`${path}.principal_kind`, 'Invalid principal_kind');
  }

  const tenantErr = validateOpaqueId(value.tenant_id, `${path}.tenant_id`);
  if (tenantErr) return tenantErr;

  if (!Array.isArray(value.roles)) {
    return fail(`${path}.roles`, 'Expected roles array');
  }
  for (let i = 0; i < value.roles.length; i++) {
    const roleErr = validateOpaqueId(value.roles[i], `${path}.roles[${i}]`, 64);
    if (roleErr) return roleErr;
  }

  return { ok: true, value: value as unknown as PrincipalRefV1 };
}

export function validateEvidenceCitationV1(
  value: unknown,
  path = 'citation',
): SchemaValidationResult<EvidenceCitationV1> {
  if (!isPlainObject(value)) {
    return fail(path, 'Expected EvidenceCitationV1 object');
  }
  const keyErr = checkAllowedKeys(
    value,
    [
      'schema_version',
      'citation_id',
      'locator',
      'digest',
      'media_type',
      'observed_at_utc',
      'byte_range',
      'line_range',
      'excerpt',
    ],
    path,
  );
  if (keyErr) return keyErr;

  const verErr = validateSchemaVersionField(
    value.schema_version,
    `${path}.schema_version`,
  );
  if (verErr) return verErr;

  const idErr = validateOpaqueId(value.citation_id, `${path}.citation_id`);
  if (idErr) return idErr;

  const locErr = validateOpaqueId(
    value.locator,
    `${path}.locator`,
    MEMORY_MCP_LIMITS.CITATION_LOCATOR_MAX_CHARS,
  );
  if (locErr) return locErr;

  const digErr = validateDigestField(value.digest, `${path}.digest`);
  if (digErr) return digErr;

  if (
    typeof value.media_type !== 'string' ||
    !(EVIDENCE_MEDIA_TYPES as readonly string[]).includes(value.media_type)
  ) {
    return fail(`${path}.media_type`, 'Invalid media_type');
  }

  const tsErr = validateTimestampField(
    value.observed_at_utc,
    `${path}.observed_at_utc`,
  );
  if (tsErr) return tsErr;

  if ('byte_range' in value) {
    const br = value.byte_range;
    if (!isPlainObject(br)) {
      return fail(`${path}.byte_range`, 'Expected byte_range object');
    }
    const brKeyErr = checkAllowedKeys(
      br,
      ['start_byte', 'end_byte_exclusive'],
      `${path}.byte_range`,
    );
    if (brKeyErr) return brKeyErr;
    if (
      typeof br.start_byte !== 'number' ||
      !Number.isInteger(br.start_byte) ||
      br.start_byte < 0 ||
      typeof br.end_byte_exclusive !== 'number' ||
      !Number.isInteger(br.end_byte_exclusive) ||
      br.end_byte_exclusive <= br.start_byte
    ) {
      return fail(
        `${path}.byte_range`,
        'byte_range requires integers 0 <= start_byte < end_byte_exclusive',
      );
    }
  }

  if ('line_range' in value) {
    const lr = value.line_range;
    if (!isPlainObject(lr)) {
      return fail(`${path}.line_range`, 'Expected line_range object');
    }
    const lrKeyErr = checkAllowedKeys(
      lr,
      ['start_line', 'end_line_inclusive'],
      `${path}.line_range`,
    );
    if (lrKeyErr) return lrKeyErr;
    if (
      typeof lr.start_line !== 'number' ||
      !Number.isInteger(lr.start_line) ||
      lr.start_line < 1 ||
      typeof lr.end_line_inclusive !== 'number' ||
      !Number.isInteger(lr.end_line_inclusive) ||
      lr.end_line_inclusive < lr.start_line
    ) {
      return fail(
        `${path}.line_range`,
        'line_range requires integers 1 <= start_line <= end_line_inclusive',
      );
    }
  }

  if ('excerpt' in value) {
    if (
      typeof value.excerpt !== 'string' ||
      value.excerpt.length > MEMORY_MCP_LIMITS.CITATION_EXCERPT_MAX_CHARS ||
      utf8Bytes(value.excerpt) >
        MEMORY_MCP_LIMITS.CITATION_EXCERPT_MAX_UTF8_BYTES
    ) {
      return fail(
        `${path}.excerpt`,
        'excerpt must be a string with <= 512 chars and <= 512 UTF-8 bytes',
      );
    }
  }

  return { ok: true, value: value as unknown as EvidenceCitationV1 };
}

export function validateSourceProvenanceV1(
  value: unknown,
  path = 'provenance',
): SchemaValidationResult<SourceProvenanceV1> {
  if (!isPlainObject(value)) {
    return fail(path, 'Expected SourceProvenanceV1 object');
  }
  const keyErr = checkAllowedKeys(
    value,
    [
      'schema_version',
      'source_class',
      'captured_by',
      'observed_at_utc',
      'citations',
      'upstream_bundle_id',
      'external_origin_ref',
    ],
    path,
  );
  if (keyErr) return keyErr;

  const verErr = validateSchemaVersionField(
    value.schema_version,
    `${path}.schema_version`,
  );
  if (verErr) return verErr;

  if (
    typeof value.source_class !== 'string' ||
    !(SOURCE_CLASSES as readonly string[]).includes(value.source_class)
  ) {
    return fail(`${path}.source_class`, 'Invalid source_class');
  }

  const capBy = validatePrincipalRefV1(
    value.captured_by,
    `${path}.captured_by`,
  );
  if (!capBy.ok) return capBy;

  const tsErr = validateTimestampField(
    value.observed_at_utc,
    `${path}.observed_at_utc`,
  );
  if (tsErr) return tsErr;

  if (
    !Array.isArray(value.citations) ||
    value.citations.length < MEMORY_MCP_LIMITS.CAPTURE_CITATIONS_MIN_ITEMS ||
    value.citations.length > MEMORY_MCP_LIMITS.CAPTURE_CITATIONS_MAX_ITEMS
  ) {
    return fail(
      `${path}.citations`,
      `citations must be an array of ${MEMORY_MCP_LIMITS.CAPTURE_CITATIONS_MIN_ITEMS}..${MEMORY_MCP_LIMITS.CAPTURE_CITATIONS_MAX_ITEMS} items`,
    );
  }
  for (let i = 0; i < value.citations.length; i++) {
    const citRes = validateEvidenceCitationV1(
      value.citations[i],
      `${path}.citations[${i}]`,
    );
    if (!citRes.ok) return citRes;
  }

  if ('upstream_bundle_id' in value) {
    const err = validateOpaqueId(
      value.upstream_bundle_id,
      `${path}.upstream_bundle_id`,
    );
    if (err) return err;
  }
  if ('external_origin_ref' in value) {
    const err = validateOpaqueId(
      value.external_origin_ref,
      `${path}.external_origin_ref`,
      512,
    );
    if (err) return err;
  }

  return { ok: true, value: value as unknown as SourceProvenanceV1 };
}

function validateStructuredAttributes(
  value: unknown,
  path: string,
): SchemaValidationFailure | null {
  if (!isPlainObject(value)) {
    return fail(path, 'structured_attributes must be a flat object');
  }
  const keys = Object.keys(value);
  if (keys.length > MEMORY_MCP_LIMITS.CAPTURE_STRUCTURED_ATTR_MAX_KEYS) {
    return fail(
      path,
      `structured_attributes exceeds maximum of ${MEMORY_MCP_LIMITS.CAPTURE_STRUCTURED_ATTR_MAX_KEYS} keys`,
    );
  }
  for (const key of keys) {
    if (!STRUCTURED_ATTR_KEY_REGEX.test(key)) {
      return fail(
        `${path}.${key}`,
        `Invalid structured_attributes key '${key}'`,
      );
    }
    const v = value[key];
    if (v === null || typeof v === 'boolean') {
      continue;
    }
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) {
        return fail(`${path}.${key}`, 'Number value must be finite');
      }
      continue;
    }
    if (typeof v === 'string') {
      if (
        utf8Bytes(v) >
        MEMORY_MCP_LIMITS.CAPTURE_STRUCTURED_ATTR_STRING_MAX_UTF8_BYTES
      ) {
        return fail(
          `${path}.${key}`,
          'String attribute exceeds 512 UTF-8 bytes',
        );
      }
      continue;
    }
    return fail(
      `${path}.${key}`,
      'Attribute value must be string, finite number, boolean, or null',
    );
  }
  const serializedBytes = utf8Bytes(JSON.stringify(value));
  if (
    serializedBytes > MEMORY_MCP_LIMITS.CAPTURE_STRUCTURED_ATTR_MAX_UTF8_BYTES
  ) {
    return fail(
      path,
      `Serialized structured_attributes exceeds ${MEMORY_MCP_LIMITS.CAPTURE_STRUCTURED_ATTR_MAX_UTF8_BYTES} UTF-8 bytes`,
    );
  }
  return null;
}

export function validateSearchInputV1(
  value: unknown,
): SchemaValidationResult<SearchInputV1> {
  if (!isPlainObject(value)) {
    return fail('', 'Expected SearchInputV1 object');
  }
  const keyErr = checkAllowedKeys(
    value,
    ['query_text', 'memory_kinds', 'status_filter', 'limit', 'cursor'],
    '',
  );
  if (keyErr) return keyErr;

  if (
    typeof value.query_text !== 'string' ||
    value.query_text.length < MEMORY_MCP_LIMITS.SEARCH_QUERY_TEXT_MIN_CHARS ||
    value.query_text.length > MEMORY_MCP_LIMITS.SEARCH_QUERY_TEXT_MAX_CHARS ||
    utf8Bytes(value.query_text) >
      MEMORY_MCP_LIMITS.SEARCH_QUERY_TEXT_MAX_UTF8_BYTES
  ) {
    return fail(
      'query_text',
      'query_text must be 1..2048 chars and <= 2048 UTF-8 bytes',
    );
  }

  if ('memory_kinds' in value) {
    if (
      !Array.isArray(value.memory_kinds) ||
      value.memory_kinds.length <
        MEMORY_MCP_LIMITS.SEARCH_MEMORY_KINDS_MIN_ITEMS ||
      value.memory_kinds.length >
        MEMORY_MCP_LIMITS.SEARCH_MEMORY_KINDS_MAX_ITEMS
    ) {
      return fail('memory_kinds', 'memory_kinds must contain 1..6 items');
    }
    const seen = new Set<string>();
    for (let i = 0; i < value.memory_kinds.length; i++) {
      const k = value.memory_kinds[i];
      if (
        typeof k !== 'string' ||
        !(MEMORY_KINDS as readonly string[]).includes(k)
      ) {
        return fail(`memory_kinds[${i}]`, 'Invalid memory_kind');
      }
      if (seen.has(k)) {
        return fail(`memory_kinds[${i}]`, 'Duplicate memory_kind');
      }
      seen.add(k);
    }
  }

  if ('status_filter' in value) {
    if (
      typeof value.status_filter !== 'string' ||
      !(RECALL_STATUS_FILTERS as readonly string[]).includes(
        value.status_filter,
      )
    ) {
      return fail('status_filter', 'Invalid status_filter');
    }
  }

  if ('limit' in value) {
    if (
      typeof value.limit !== 'number' ||
      !Number.isInteger(value.limit) ||
      value.limit < MEMORY_MCP_LIMITS.SEARCH_LIMIT_MIN ||
      value.limit > MEMORY_MCP_LIMITS.SEARCH_LIMIT_MAX
    ) {
      return fail('limit', 'limit must be an integer between 1 and 25');
    }
  }

  if ('cursor' in value) {
    if (
      typeof value.cursor !== 'string' ||
      value.cursor.length < MEMORY_MCP_LIMITS.SEARCH_CURSOR_MIN_CHARS ||
      value.cursor.length > MEMORY_MCP_LIMITS.SEARCH_CURSOR_MAX_CHARS
    ) {
      return fail('cursor', 'cursor must be a string of length 1..512');
    }
  }

  return { ok: true, value: value as unknown as SearchInputV1 };
}

export function validateGetInputV1(
  value: unknown,
): SchemaValidationResult<GetInputV1> {
  if (!isPlainObject(value)) {
    return fail('', 'Expected GetInputV1 object');
  }
  const keyErr = checkAllowedKeys(value, ['memory_ids'], '');
  if (keyErr) return keyErr;

  if (
    !Array.isArray(value.memory_ids) ||
    value.memory_ids.length < MEMORY_MCP_LIMITS.GET_MEMORY_IDS_MIN_ITEMS ||
    value.memory_ids.length > MEMORY_MCP_LIMITS.GET_MEMORY_IDS_MAX_ITEMS
  ) {
    return fail('memory_ids', 'memory_ids must contain 1..10 items');
  }

  const seen = new Set<string>();
  for (let i = 0; i < value.memory_ids.length; i++) {
    const id = value.memory_ids[i];
    const idErr = validateOpaqueId(id, `memory_ids[${i}]`);
    if (idErr) return idErr;
    if (seen.has(id as string)) {
      return fail(`memory_ids[${i}]`, 'Duplicate memory_id');
    }
    seen.add(id as string);
  }

  return { ok: true, value: value as unknown as GetInputV1 };
}

export function validateCaptureInputV1(
  value: unknown,
): SchemaValidationResult<CaptureInputV1> {
  if (!isPlainObject(value)) {
    return fail('', 'Expected CaptureInputV1 object');
  }
  const keyErr = checkAllowedKeys(
    value,
    [
      'idempotency_key',
      'memory_kind',
      'payload',
      'provenance',
      'sensitivity',
      'sharing_policy',
      'retention_hint',
      'reconciliation_hint',
    ],
    '',
  );
  if (keyErr) return keyErr;

  const idemErr = validateOpaqueId(value.idempotency_key, 'idempotency_key');
  if (idemErr) return idemErr;

  if (
    typeof value.memory_kind !== 'string' ||
    !(MEMORY_KINDS as readonly string[]).includes(value.memory_kind)
  ) {
    return fail('memory_kind', 'Invalid memory_kind');
  }

  if (!isPlainObject(value.payload)) {
    return fail('payload', 'Expected payload object');
  }
  const payloadKeyErr = checkAllowedKeys(
    value.payload,
    ['summary', 'statement', 'structured_attributes'],
    'payload',
  );
  if (payloadKeyErr) return payloadKeyErr;

  if (
    typeof value.payload.summary !== 'string' ||
    value.payload.summary.length <
      MEMORY_MCP_LIMITS.CAPTURE_SUMMARY_MIN_CHARS ||
    value.payload.summary.length >
      MEMORY_MCP_LIMITS.CAPTURE_SUMMARY_MAX_CHARS ||
    utf8Bytes(value.payload.summary) >
      MEMORY_MCP_LIMITS.CAPTURE_SUMMARY_MAX_UTF8_BYTES
  ) {
    return fail(
      'payload.summary',
      'summary must be 1..512 chars and <= 512 UTF-8 bytes',
    );
  }

  if (
    typeof value.payload.statement !== 'string' ||
    value.payload.statement.length <
      MEMORY_MCP_LIMITS.CAPTURE_STATEMENT_MIN_CHARS ||
    value.payload.statement.length >
      MEMORY_MCP_LIMITS.CAPTURE_STATEMENT_MAX_CHARS ||
    utf8Bytes(value.payload.statement) >
      MEMORY_MCP_LIMITS.CAPTURE_STATEMENT_MAX_UTF8_BYTES
  ) {
    return fail(
      'payload.statement',
      'statement must be 1..8192 chars and <= 8192 UTF-8 bytes',
    );
  }

  if ('structured_attributes' in value.payload) {
    const attrErr = validateStructuredAttributes(
      value.payload.structured_attributes,
      'payload.structured_attributes',
    );
    if (attrErr) return attrErr;
  }

  const provRes = validateSourceProvenanceV1(value.provenance, 'provenance');
  if (!provRes.ok) return provRes;

  if ('sensitivity' in value) {
    if (
      typeof value.sensitivity !== 'string' ||
      !(SENSITIVITY_LABELS as readonly string[]).includes(value.sensitivity)
    ) {
      return fail('sensitivity', 'Invalid sensitivity');
    }
  }

  if ('sharing_policy' in value) {
    if (
      typeof value.sharing_policy !== 'string' ||
      !(SHARING_POLICIES as readonly string[]).includes(value.sharing_policy)
    ) {
      return fail('sharing_policy', 'Invalid sharing_policy');
    }
  }

  if ('retention_hint' in value) {
    const rh = value.retention_hint;
    if (!isPlainObject(rh)) {
      return fail('retention_hint', 'Expected retention_hint object');
    }
    const rhKeyErr = checkAllowedKeys(
      rh,
      ['expires_at_utc', 'expiry_outcome'],
      'retention_hint',
    );
    if (rhKeyErr) return rhKeyErr;
    if ('expires_at_utc' in rh) {
      const tsErr = validateTimestampField(
        rh.expires_at_utc,
        'retention_hint.expires_at_utc',
      );
      if (tsErr) return tsErr;
    }
    if ('expiry_outcome' in rh) {
      if (
        typeof rh.expiry_outcome !== 'string' ||
        !(RETENTION_OUTCOMES as readonly string[]).includes(rh.expiry_outcome)
      ) {
        return fail('retention_hint.expiry_outcome', 'Invalid expiry_outcome');
      }
    }
  }

  if ('reconciliation_hint' in value) {
    const rec = value.reconciliation_hint;
    if (!isPlainObject(rec)) {
      return fail('reconciliation_hint', 'Expected reconciliation_hint object');
    }
    const recKeyErr = checkAllowedKeys(
      rec,
      ['family_refs'],
      'reconciliation_hint',
    );
    if (recKeyErr) return recKeyErr;
    if (
      !Array.isArray(rec.family_refs) ||
      rec.family_refs.length <
        MEMORY_MCP_LIMITS.RECONCILIATION_FAMILY_REFS_MIN_ITEMS ||
      rec.family_refs.length >
        MEMORY_MCP_LIMITS.RECONCILIATION_FAMILY_REFS_MAX_ITEMS
    ) {
      return fail(
        'reconciliation_hint.family_refs',
        'family_refs must contain 1..8 items',
      );
    }
    const seen = new Set<string>();
    for (let i = 0; i < rec.family_refs.length; i++) {
      const ref = rec.family_refs[i];
      const refErr = validateOpaqueId(
        ref,
        `reconciliation_hint.family_refs[${i}]`,
      );
      if (refErr) return refErr;
      if (seen.has(ref as string)) {
        return fail(
          `reconciliation_hint.family_refs[${i}]`,
          'Duplicate family_ref',
        );
      }
      seen.add(ref as string);
    }
  }

  return { ok: true, value: value as unknown as CaptureInputV1 };
}

export function validateRequestAdmissionInputV1(
  value: unknown,
): SchemaValidationResult<RequestAdmissionInputV1> {
  if (!isPlainObject(value)) {
    return fail('', 'Expected RequestAdmissionInputV1 object');
  }
  const keyErr = checkAllowedKeys(
    value,
    ['idempotency_key', 'memory_id', 'rationale_code'],
    '',
  );
  if (keyErr) return keyErr;

  for (const field of [
    'idempotency_key',
    'memory_id',
    'rationale_code',
  ] as const) {
    const err = validateOpaqueId(value[field], field);
    if (err) return err;
  }

  return { ok: true, value: value as unknown as RequestAdmissionInputV1 };
}

export function validateWithdrawInputV1(
  value: unknown,
): SchemaValidationResult<WithdrawInputV1> {
  if (!isPlainObject(value)) {
    return fail('', 'Expected WithdrawInputV1 object');
  }
  const keyErr = checkAllowedKeys(
    value,
    ['idempotency_key', 'memory_id', 'reason_code'],
    '',
  );
  if (keyErr) return keyErr;

  for (const field of [
    'idempotency_key',
    'memory_id',
    'reason_code',
  ] as const) {
    const err = validateOpaqueId(value[field], field);
    if (err) return err;
  }

  return { ok: true, value: value as unknown as WithdrawInputV1 };
}

export function validateForgetInputV1(
  value: unknown,
): SchemaValidationResult<ForgetInputV1> {
  if (!isPlainObject(value)) {
    return fail('', 'Expected ForgetInputV1 object');
  }
  const keyErr = checkAllowedKeys(
    value,
    ['idempotency_key', 'memory_id', 'reason_code'],
    '',
  );
  if (keyErr) return keyErr;

  for (const field of [
    'idempotency_key',
    'memory_id',
    'reason_code',
  ] as const) {
    const err = validateOpaqueId(value[field], field);
    if (err) return err;
  }

  return { ok: true, value: value as unknown as ForgetInputV1 };
}

export function validateToolInputV1(
  toolName: EngramMemoryToolName,
  value: unknown,
): SchemaValidationResult<
  | SearchInputV1
  | GetInputV1
  | CaptureInputV1
  | RequestAdmissionInputV1
  | WithdrawInputV1
  | ForgetInputV1
> {
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
      'schema_version',
      'memory_id',
      'scope_ref',
      'memory_kind',
      'status',
      'summary',
      'statement',
      'structured_attributes',
      'content_digest',
      'sensitivity',
      'source_class',
      'citations',
      'redaction_state',
      'redacted_fields',
      'admitted_at_utc',
      'supersedes_ids',
      'active_dispute_ids',
    ],
    path,
  );
  if (keyErr) return keyErr;

  const verErr = validateSchemaVersionField(
    value.schema_version,
    `${path}.schema_version`,
  );
  if (verErr) return verErr;

  const idErr = validateOpaqueId(value.memory_id, `${path}.memory_id`);
  if (idErr) return idErr;

  const scopeRes = validateScopeRefV1(value.scope_ref, `${path}.scope_ref`);
  if (!scopeRes.ok) return scopeRes;

  if (
    typeof value.memory_kind !== 'string' ||
    !(MEMORY_KINDS as readonly string[]).includes(value.memory_kind)
  ) {
    return fail(`${path}.memory_kind`, 'Invalid memory_kind');
  }

  if (
    typeof value.status !== 'string' ||
    !(RETRIEVAL_STATUSES as readonly string[]).includes(value.status)
  ) {
    return fail(`${path}.status`, 'Invalid retrieval status');
  }

  if (
    typeof value.summary !== 'string' ||
    value.summary.length < 1 ||
    value.summary.length > 512 ||
    utf8Bytes(value.summary) > 512
  ) {
    return fail(`${path}.summary`, 'summary must be 1..512 chars/bytes');
  }

  if ('statement' in value) {
    if (
      typeof value.statement !== 'string' ||
      value.statement.length < 1 ||
      value.statement.length > 8192 ||
      utf8Bytes(value.statement) > 8192
    ) {
      return fail(`${path}.statement`, 'statement must be 1..8192 chars/bytes');
    }
  }

  if ('structured_attributes' in value) {
    const attrErr = validateStructuredAttributes(
      value.structured_attributes,
      `${path}.structured_attributes`,
    );
    if (attrErr) return attrErr;
  }

  const digErr = validateDigestField(
    value.content_digest,
    `${path}.content_digest`,
  );
  if (digErr) return digErr;

  if (
    typeof value.sensitivity !== 'string' ||
    !(SENSITIVITY_LABELS as readonly string[]).includes(value.sensitivity)
  ) {
    return fail(`${path}.sensitivity`, 'Invalid sensitivity');
  }

  if (
    typeof value.source_class !== 'string' ||
    !(SOURCE_CLASSES as readonly string[]).includes(value.source_class)
  ) {
    return fail(`${path}.source_class`, 'Invalid source_class');
  }

  if (
    !Array.isArray(value.citations) ||
    value.citations.length < 1 ||
    value.citations.length > 16
  ) {
    return fail(`${path}.citations`, 'citations must contain 1..16 items');
  }
  for (let i = 0; i < value.citations.length; i++) {
    const citRes = validateEvidenceCitationV1(
      value.citations[i],
      `${path}.citations[${i}]`,
    );
    if (!citRes.ok) return citRes;
  }

  if (
    typeof value.redaction_state !== 'string' ||
    !(REDACTION_STATES as readonly string[]).includes(value.redaction_state)
  ) {
    return fail(`${path}.redaction_state`, 'Invalid redaction_state');
  }

  if (!Array.isArray(value.redacted_fields)) {
    return fail(`${path}.redacted_fields`, 'Expected redacted_fields array');
  }
  for (let i = 0; i < value.redacted_fields.length; i++) {
    const rfErr = validateOpaqueId(
      value.redacted_fields[i],
      `${path}.redacted_fields[${i}]`,
    );
    if (rfErr) return rfErr;
  }

  if (value.redaction_state === 'withheld') {
    if ('statement' in value || 'structured_attributes' in value) {
      return fail(
        `${path}.redaction_state`,
        'withheld records must omit statement and structured_attributes',
      );
    }
    for (let i = 0; i < value.citations.length; i++) {
      const cit = value.citations[i] as Record<string, unknown>;
      if ('excerpt' in cit) {
        return fail(
          `${path}.citations[${i}].excerpt`,
          'withheld records must omit citation excerpts',
        );
      }
    }
  }

  const admTsErr = validateTimestampField(
    value.admitted_at_utc,
    `${path}.admitted_at_utc`,
  );
  if (admTsErr) return admTsErr;

  for (const arrField of ['supersedes_ids', 'active_dispute_ids'] as const) {
    const arr = value[arrField];
    if (!Array.isArray(arr)) {
      return fail(`${path}.${arrField}`, `Expected ${arrField} array`);
    }
    for (let i = 0; i < arr.length; i++) {
      const idErr = validateOpaqueId(arr[i], `${path}.${arrField}[${i}]`);
      if (idErr) return idErr;
    }
  }

  return { ok: true, value: value as unknown as RedactedMemoryRecordV2 };
}

export function validateSearchOutputV1(
  value: unknown,
  path = 'result',
): SchemaValidationResult<SearchOutputV1> {
  if (!isPlainObject(value)) {
    return fail(path, 'Expected SearchOutputV1 object');
  }
  const keyErr = checkAllowedKeys(
    value,
    [
      'schema_version',
      'packet_id',
      'query_id',
      'scope_ref',
      'status_filter',
      'ordering',
      'generated_at_utc',
      'records',
      'withheld_count',
      'page',
    ],
    path,
  );
  if (keyErr) return keyErr;

  const verErr = validateSchemaVersionField(
    value.schema_version,
    `${path}.schema_version`,
  );
  if (verErr) return verErr;

  for (const k of ['packet_id', 'query_id'] as const) {
    const err = validateOpaqueId(value[k], `${path}.${k}`);
    if (err) return err;
  }

  const scopeRes = validateScopeRefV1(value.scope_ref, `${path}.scope_ref`);
  if (!scopeRes.ok) return scopeRes;

  if (
    typeof value.status_filter !== 'string' ||
    !(RECALL_STATUS_FILTERS as readonly string[]).includes(value.status_filter)
  ) {
    return fail(`${path}.status_filter`, 'Invalid status_filter');
  }

  if (!isPlainObject(value.ordering)) {
    return fail(`${path}.ordering`, 'Expected ordering object');
  }
  const ordKeyErr = checkAllowedKeys(
    value.ordering,
    ['primary', 'secondary', 'tertiary'],
    `${path}.ordering`,
  );
  if (ordKeyErr) return ordKeyErr;
  if (
    value.ordering.primary !== 'relevance_score_bps_desc' ||
    value.ordering.secondary !== 'admitted_at_utc_desc' ||
    value.ordering.tertiary !== 'memory_id_asc'
  ) {
    return fail(`${path}.ordering`, 'Invalid ordering tuple');
  }

  const tsErr = validateTimestampField(
    value.generated_at_utc,
    `${path}.generated_at_utc`,
  );
  if (tsErr) return tsErr;

  if (
    !Array.isArray(value.records) ||
    value.records.length > MEMORY_MCP_LIMITS.SEARCH_LIMIT_MAX
  ) {
    return fail(`${path}.records`, 'records must be an array of 0..25 items');
  }
  for (let i = 0; i < value.records.length; i++) {
    const recPkt = value.records[i];
    if (!isPlainObject(recPkt)) {
      return fail(
        `${path}.records[${i}]`,
        'Expected RecallRecordPacketV3 object',
      );
    }
    const pktKeyErr = checkAllowedKeys(
      recPkt,
      ['rank', 'relevance_score_bps', 'record'],
      `${path}.records[${i}]`,
    );
    if (pktKeyErr) return pktKeyErr;
    if (
      typeof recPkt.rank !== 'number' ||
      !Number.isInteger(recPkt.rank) ||
      recPkt.rank < 1
    ) {
      return fail(`${path}.records[${i}].rank`, 'rank must be integer >= 1');
    }
    if (
      typeof recPkt.relevance_score_bps !== 'number' ||
      !Number.isInteger(recPkt.relevance_score_bps) ||
      recPkt.relevance_score_bps < 0 ||
      recPkt.relevance_score_bps > 10000
    ) {
      return fail(
        `${path}.records[${i}].relevance_score_bps`,
        'relevance_score_bps must be integer 0..10000',
      );
    }
    const recRes = validateRedactedMemoryRecordV2(
      recPkt.record,
      `${path}.records[${i}].record`,
    );
    if (!recRes.ok) return recRes;
  }

  if (
    typeof value.withheld_count !== 'number' ||
    !Number.isInteger(value.withheld_count) ||
    value.withheld_count < 0
  ) {
    return fail(`${path}.withheld_count`, 'withheld_count must be integer >= 0');
  }

  if (!isPlainObject(value.page)) {
    return fail(`${path}.page`, 'Expected page object');
  }
  const pageKeyErr = checkAllowedKeys(
    value.page,
    ['returned_count', 'has_more', 'next_cursor'],
    `${path}.page`,
  );
  if (pageKeyErr) return pageKeyErr;
  if (
    typeof value.page.returned_count !== 'number' ||
    !Number.isInteger(value.page.returned_count) ||
    value.page.returned_count !== value.records.length
  ) {
    return fail(
      `${path}.page.returned_count`,
      'returned_count must equal records.length',
    );
  }
  if (typeof value.page.has_more !== 'boolean') {
    return fail(`${path}.page.has_more`, 'has_more must be boolean');
  }
  if ('next_cursor' in value.page) {
    const curErr = validateOpaqueId(
      value.page.next_cursor,
      `${path}.page.next_cursor`,
      512,
    );
    if (curErr) return curErr;
  }

  return { ok: true, value: value as unknown as SearchOutputV1 };
}

export function validateGetOutputV1(
  value: unknown,
  path = 'result',
): SchemaValidationResult<GetOutputV1> {
  if (!isPlainObject(value)) {
    return fail(path, 'Expected GetOutputV1 object');
  }
  const keyErr = checkAllowedKeys(
    value,
    ['schema_version', 'packet_id', 'scope_ref', 'generated_at_utc', 'results'],
    path,
  );
  if (keyErr) return keyErr;

  const verErr = validateSchemaVersionField(
    value.schema_version,
    `${path}.schema_version`,
  );
  if (verErr) return verErr;

  const pktErr = validateOpaqueId(value.packet_id, `${path}.packet_id`);
  if (pktErr) return pktErr;

  const scopeRes = validateScopeRefV1(value.scope_ref, `${path}.scope_ref`);
  if (!scopeRes.ok) return scopeRes;

  const tsErr = validateTimestampField(
    value.generated_at_utc,
    `${path}.generated_at_utc`,
  );
  if (tsErr) return tsErr;

  if (
    !Array.isArray(value.results) ||
    value.results.length < MEMORY_MCP_LIMITS.GET_MEMORY_IDS_MIN_ITEMS ||
    value.results.length > MEMORY_MCP_LIMITS.GET_MEMORY_IDS_MAX_ITEMS
  ) {
    return fail(`${path}.results`, 'results must contain 1..10 items');
  }
  for (let i = 0; i < value.results.length; i++) {
    const receipt = value.results[i];
    const rPath = `${path}.results[${i}]`;
    if (!isPlainObject(receipt)) {
      return fail(rPath, 'Expected MemoryReadReceiptV1 object');
    }
    const rKeyErr = checkAllowedKeys(
      receipt,
      ['memory_id', 'outcome', 'status', 'record', 'reason_codes'],
      rPath,
    );
    if (rKeyErr) return rKeyErr;

    const idErr = validateOpaqueId(receipt.memory_id, `${rPath}.memory_id`);
    if (idErr) return idErr;

    if (
      typeof receipt.outcome !== 'string' ||
      !(READ_OUTCOMES as readonly string[]).includes(receipt.outcome)
    ) {
      return fail(`${rPath}.outcome`, 'Invalid read outcome');
    }

    if ('status' in receipt) {
      if (
        typeof receipt.status !== 'string' ||
        !(MEMORY_STATUSES as readonly string[]).includes(receipt.status)
      ) {
        return fail(`${rPath}.status`, 'Invalid memory status');
      }
    }

    if (receipt.outcome === 'returned') {
      if (!('record' in receipt)) {
        return fail(
          `${rPath}.record`,
          'record is required when outcome is returned',
        );
      }
      if (receipt.status !== 'admitted' && receipt.status !== 'disputed') {
        return fail(
          `${rPath}.status`,
          'returned outcome requires status admitted or disputed',
        );
      }
      const recRes = validateRedactedMemoryRecordV2(
        receipt.record,
        `${rPath}.record`,
      );
      if (!recRes.ok) return recRes;
    } else {
      if ('record' in receipt) {
        return fail(
          `${rPath}.record`,
          'record must be omitted when outcome is not returned',
        );
      }
      if (receipt.outcome === 'not_found' && 'status' in receipt) {
        return fail(
          `${rPath}.status`,
          'status must be omitted when outcome is not_found',
        );
      }
    }

    if (!Array.isArray(receipt.reason_codes)) {
      return fail(`${rPath}.reason_codes`, 'Expected reason_codes array');
    }
    for (let j = 0; j < receipt.reason_codes.length; j++) {
      const rcErr = validateOpaqueId(
        receipt.reason_codes[j],
        `${rPath}.reason_codes[${j}]`,
      );
      if (rcErr) return rcErr;
    }
  }

  return { ok: true, value: value as unknown as GetOutputV1 };
}

export function validateCaptureOutputV1(
  value: unknown,
  path = 'result',
): SchemaValidationResult<CaptureOutputV1> {
  if (!isPlainObject(value)) {
    return fail(path, 'Expected CaptureOutputV1 object');
  }
  const keyErr = checkAllowedKeys(
    value,
    [
      'schema_version',
      'memory_id',
      'status',
      'content_digest',
      'captured_at_utc',
      'event_id',
      'idempotent_replay',
      'quarantine_reason_codes',
    ],
    path,
  );
  if (keyErr) return keyErr;

  const verErr = validateSchemaVersionField(
    value.schema_version,
    `${path}.schema_version`,
  );
  if (verErr) return verErr;

  const idErr = validateOpaqueId(value.memory_id, `${path}.memory_id`);
  if (idErr) return idErr;

  if (value.status !== 'candidate' && value.status !== 'quarantined') {
    return fail(`${path}.status`, 'status must be candidate or quarantined');
  }

  const digErr = validateDigestField(
    value.content_digest,
    `${path}.content_digest`,
  );
  if (digErr) return digErr;

  const tsErr = validateTimestampField(
    value.captured_at_utc,
    `${path}.captured_at_utc`,
  );
  if (tsErr) return tsErr;

  const evErr = validateOpaqueId(value.event_id, `${path}.event_id`);
  if (evErr) return evErr;

  if (typeof value.idempotent_replay !== 'boolean') {
    return fail(
      `${path}.idempotent_replay`,
      'idempotent_replay must be boolean',
    );
  }

  if ('quarantine_reason_codes' in value) {
    if (!Array.isArray(value.quarantine_reason_codes)) {
      return fail(
        `${path}.quarantine_reason_codes`,
        'Expected quarantine_reason_codes array',
      );
    }
    for (let i = 0; i < value.quarantine_reason_codes.length; i++) {
      const rcErr = validateOpaqueId(
        value.quarantine_reason_codes[i],
        `${path}.quarantine_reason_codes[${i}]`,
      );
      if (rcErr) return rcErr;
    }
  }

  return { ok: true, value: value as unknown as CaptureOutputV1 };
}

function validateAdmissibilityAssessmentV1(
  value: unknown,
  path: string,
): SchemaValidationResult<AdmissibilityAssessmentV1> {
  if (!isPlainObject(value)) {
    return fail(path, 'Expected AdmissibilityAssessmentV1 object');
  }
  const keyErr = checkAllowedKeys(
    value,
    [
      'schema_version',
      'policy_id',
      'policy_version',
      'admissible',
      'confidence_bps',
      'assessed_at_utc',
      'assessed_by',
      'reason_codes',
      'required_corroboration_count',
      'observed_corroboration_count',
    ],
    path,
  );
  if (keyErr) return keyErr;

  const verErr = validateSchemaVersionField(
    value.schema_version,
    `${path}.schema_version`,
  );
  if (verErr) return verErr;

  const polErr = validateOpaqueId(value.policy_id, `${path}.policy_id`);
  if (polErr) return polErr;

  const polVerErr = validateOpaqueId(
    value.policy_version,
    `${path}.policy_version`,
    64,
  );
  if (polVerErr) return polVerErr;

  if (typeof value.admissible !== 'boolean') {
    return fail(`${path}.admissible`, 'admissible must be boolean');
  }

  if (
    typeof value.confidence_bps !== 'number' ||
    !Number.isInteger(value.confidence_bps) ||
    value.confidence_bps < 0 ||
    value.confidence_bps > 10000
  ) {
    return fail(
      `${path}.confidence_bps`,
      'confidence_bps must be integer 0..10000',
    );
  }

  const tsErr = validateTimestampField(
    value.assessed_at_utc,
    `${path}.assessed_at_utc`,
  );
  if (tsErr) return tsErr;

  const byRes = validatePrincipalRefV1(
    value.assessed_by,
    `${path}.assessed_by`,
  );
  if (!byRes.ok) return byRes;

  if (!Array.isArray(value.reason_codes)) {
    return fail(`${path}.reason_codes`, 'Expected reason_codes array');
  }
  for (let i = 0; i < value.reason_codes.length; i++) {
    const rcErr = validateOpaqueId(
      value.reason_codes[i],
      `${path}.reason_codes[${i}]`,
    );
    if (rcErr) return rcErr;
  }

  for (const k of [
    'required_corroboration_count',
    'observed_corroboration_count',
  ] as const) {
    if (
      typeof value[k] !== 'number' ||
      !Number.isInteger(value[k]) ||
      (value[k] as number) < 0
    ) {
      return fail(`${path}.${k}`, `${k} must be integer >= 0`);
    }
  }

  return { ok: true, value: value as unknown as AdmissibilityAssessmentV1 };
}

export function validateRequestAdmissionOutputV1(
  value: unknown,
  path = 'result',
): SchemaValidationResult<RequestAdmissionOutputV1> {
  if (!isPlainObject(value)) {
    return fail(path, 'Expected RequestAdmissionOutputV1 object');
  }
  const keyErr = checkAllowedKeys(
    value,
    [
      'schema_version',
      'memory_id',
      'outcome',
      'resulting_status',
      'decided_at_utc',
      'assessment',
      'idempotent_replay',
      'event_id',
    ],
    path,
  );
  if (keyErr) return keyErr;

  const verErr = validateSchemaVersionField(
    value.schema_version,
    `${path}.schema_version`,
  );
  if (verErr) return verErr;

  const idErr = validateOpaqueId(value.memory_id, `${path}.memory_id`);
  if (idErr) return idErr;

  if (
    value.outcome !== 'admitted' &&
    value.outcome !== 'quarantined' &&
    value.outcome !== 'rejected'
  ) {
    return fail(`${path}.outcome`, 'Invalid outcome');
  }

  if (
    value.resulting_status !== 'admitted' &&
    value.resulting_status !== 'quarantined' &&
    value.resulting_status !== 'candidate'
  ) {
    return fail(`${path}.resulting_status`, 'Invalid resulting_status');
  }

  const tsErr = validateTimestampField(
    value.decided_at_utc,
    `${path}.decided_at_utc`,
  );
  if (tsErr) return tsErr;

  const assRes = validateAdmissibilityAssessmentV1(
    value.assessment,
    `${path}.assessment`,
  );
  if (!assRes.ok) return assRes;

  if (typeof value.idempotent_replay !== 'boolean') {
    return fail(
      `${path}.idempotent_replay`,
      'idempotent_replay must be boolean',
    );
  }

  if ('event_id' in value) {
    const evErr = validateOpaqueId(value.event_id, `${path}.event_id`);
    if (evErr) return evErr;
  }

  return { ok: true, value: value as unknown as RequestAdmissionOutputV1 };
}

export function validateWithdrawOutputV1(
  value: unknown,
  path = 'result',
): SchemaValidationResult<WithdrawOutputV1> {
  if (!isPlainObject(value)) {
    return fail(path, 'Expected WithdrawOutputV1 object');
  }
  const keyErr = checkAllowedKeys(
    value,
    [
      'schema_version',
      'memory_id',
      'previous_status',
      'status',
      'withdrawn_at_utc',
      'event_id',
      'idempotent_replay',
    ],
    path,
  );
  if (keyErr) return keyErr;

  const verErr = validateSchemaVersionField(
    value.schema_version,
    `${path}.schema_version`,
  );
  if (verErr) return verErr;

  const idErr = validateOpaqueId(value.memory_id, `${path}.memory_id`);
  if (idErr) return idErr;

  if (
    value.previous_status !== 'candidate' &&
    value.previous_status !== 'quarantined' &&
    value.previous_status !== 'admitted' &&
    value.previous_status !== 'disputed'
  ) {
    return fail(`${path}.previous_status`, 'Invalid previous_status');
  }

  if (value.status !== 'withdrawn') {
    return fail(`${path}.status`, 'status must be withdrawn');
  }

  const tsErr = validateTimestampField(
    value.withdrawn_at_utc,
    `${path}.withdrawn_at_utc`,
  );
  if (tsErr) return tsErr;

  const evErr = validateOpaqueId(value.event_id, `${path}.event_id`);
  if (evErr) return evErr;

  if (typeof value.idempotent_replay !== 'boolean') {
    return fail(
      `${path}.idempotent_replay`,
      'idempotent_replay must be boolean',
    );
  }

  return { ok: true, value: value as unknown as WithdrawOutputV1 };
}

export function validateForgetOutputV1(
  value: unknown,
  path = 'result',
): SchemaValidationResult<ForgetOutputV1> {
  if (!isPlainObject(value)) {
    return fail(path, 'Expected ForgetOutputV1 object');
  }
  const keyErr = checkAllowedKeys(
    value,
    [
      'schema_version',
      'memory_id',
      'tombstone_id',
      'erased_at_utc',
      'event_id',
      'erased_artifact_digests',
      'destroyed_key_ids',
      'idempotent_replay',
    ],
    path,
  );
  if (keyErr) return keyErr;

  const verErr = validateSchemaVersionField(
    value.schema_version,
    `${path}.schema_version`,
  );
  if (verErr) return verErr;

  for (const k of ['memory_id', 'tombstone_id', 'event_id'] as const) {
    const err = validateOpaqueId(value[k], `${path}.${k}`);
    if (err) return err;
  }

  const tsErr = validateTimestampField(
    value.erased_at_utc,
    `${path}.erased_at_utc`,
  );
  if (tsErr) return tsErr;

  if (!Array.isArray(value.erased_artifact_digests)) {
    return fail(
      `${path}.erased_artifact_digests`,
      'Expected erased_artifact_digests array',
    );
  }
  for (let i = 0; i < value.erased_artifact_digests.length; i++) {
    const digErr = validateDigestField(
      value.erased_artifact_digests[i],
      `${path}.erased_artifact_digests[${i}]`,
    );
    if (digErr) return digErr;
  }

  if (!Array.isArray(value.destroyed_key_ids)) {
    return fail(
      `${path}.destroyed_key_ids`,
      'Expected destroyed_key_ids array',
    );
  }
  for (let i = 0; i < value.destroyed_key_ids.length; i++) {
    const kErr = validateOpaqueId(
      value.destroyed_key_ids[i],
      `${path}.destroyed_key_ids[${i}]`,
    );
    if (kErr) return kErr;
  }

  if (typeof value.idempotent_replay !== 'boolean') {
    return fail(
      `${path}.idempotent_replay`,
      'idempotent_replay must be boolean',
    );
  }

  return { ok: true, value: value as unknown as ForgetOutputV1 };
}

export function validateToolResultV1(
  toolName: EngramMemoryToolName,
  value: unknown,
): SchemaValidationResult<ToolResultV1<unknown>> {
  if (!isPlainObject(value)) {
    return fail('', 'Expected ToolResultV1 object');
  }
  const verErr = validateSchemaVersionField(
    value.schema_version,
    'schema_version',
  );
  if (verErr) return verErr;

  if (value.tool !== toolName) {
    return fail('tool', `Expected tool '${toolName}'`);
  }

  if (value.ok === true) {
    const keyErr = checkAllowedKeys(
      value,
      ['ok', 'schema_version', 'tool', 'result'],
      '',
    );
    if (keyErr) return keyErr;

    let res: SchemaValidationResult<unknown>;
    switch (toolName) {
      case 'engram_memory_search':
        res = validateSearchOutputV1(value.result, 'result');
        break;
      case 'engram_memory_get':
        res = validateGetOutputV1(value.result, 'result');
        break;
      case 'engram_memory_capture':
        res = validateCaptureOutputV1(value.result, 'result');
        break;
      case 'engram_memory_request_admission':
        res = validateRequestAdmissionOutputV1(value.result, 'result');
        break;
      case 'engram_memory_withdraw':
        res = validateWithdrawOutputV1(value.result, 'result');
        break;
      case 'engram_memory_forget':
        res = validateForgetOutputV1(value.result, 'result');
        break;
    }
    if (!res.ok) return res;
    return { ok: true, value: value as unknown as ToolResultV1<unknown> };
  }

  if (value.ok === false) {
    const keyErr = checkAllowedKeys(
      value,
      ['ok', 'schema_version', 'tool', 'error'],
      '',
    );
    if (keyErr) return keyErr;

    if (!isPlainObject(value.error)) {
      return fail('error', 'Expected error object');
    }
    const errKeyErr = checkAllowedKeys(
      value.error,
      ['code', 'message', 'retryable', 'details'],
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
      typeof value.error.message !== 'string' ||
      value.error.message.length < 1 ||
      value.error.message.length > 1024
    ) {
      return fail(
        'error.message',
        'error.message must be a non-empty string <= 1024 chars',
      );
    }
    if (typeof value.error.retryable !== 'boolean') {
      return fail('error.retryable', 'error.retryable must be boolean');
    }
    if ('details' in value.error) {
      if (!isPlainObject(value.error.details)) {
        return fail('error.details', 'error.details must be a flat object');
      }
      for (const [dk, dv] of Object.entries(value.error.details)) {
        if (
          dv !== null &&
          typeof dv !== 'string' &&
          typeof dv !== 'boolean' &&
          (typeof dv !== 'number' || !Number.isFinite(dv))
        ) {
          return fail(
            `error.details.${dk}`,
            'Detail value must be string, finite number, boolean, or null',
          );
        }
      }
    }
    return { ok: true, value: value as unknown as ToolResultV1<unknown> };
  }

  return fail('ok', 'ok must be boolean');
}

/**
 * Validates the dual-channel MCP response (`structuredContent` + single JSON
 * text block in `content`, `isError === !structuredContent.ok`, and serialized
 * payload <= 65,536 UTF-8 bytes).
 */
export function validateMcpToolCallResponseV1(
  toolName: EngramMemoryToolName,
  response: unknown,
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
    return fail('content[0]', 'content[0] must have type="text" and string text');
  }

  if (utf8Bytes(block.text) > MEMORY_MCP_LIMITS.MAX_SERIALIZED_RESPONSE_UTF8_BYTES) {
    return fail(
      'content[0].text',
      `Serialized response exceeds ${MEMORY_MCP_LIMITS.MAX_SERIALIZED_RESPONSE_UTF8_BYTES} UTF-8 bytes`,
      'RESULT_TOO_LARGE',
    );
  }

  let parsedText: unknown;
  try {
    parsedText = JSON.parse(block.text);
  } catch {
    return fail('content[0].text', 'content[0].text is not valid JSON');
  }

  if (JSON.stringify(parsedText) !== JSON.stringify(response.structuredContent)) {
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
 * Validates that a pagination cursor binding matches the current search query
 * parameters, scope, ordering, snapshot watermark, and TTL (`expires_at_utc`).
 */
export function validatePaginationCursorBindingV1(
  binding: PaginationCursorBindingV1,
  request: {
    readonly scope_ref: ScopeRefV1;
    readonly query_digest: string;
    readonly status_filter: string;
    readonly memory_kinds: readonly string[];
    readonly ordering: RecallOrderingV1;
    readonly snapshot_watermark: string;
  },
  nowUtc: string,
): SchemaValidationResult<PaginationCursorBindingV1> {
  if (!isValidIsoUtcTimestamp(nowUtc)) {
    return fail('now_utc', 'Invalid now_utc timestamp', 'INVALID_TIMESTAMP');
  }
  if (!isValidIsoUtcTimestamp(binding.expires_at_utc)) {
    return fail('cursor', 'Invalid cursor expiration timestamp');
  }
  if (Date.parse(nowUtc) > Date.parse(binding.expires_at_utc)) {
    return fail('cursor', 'Pagination cursor has expired');
  }
  if (
    JSON.stringify(binding.scope_ref) !== JSON.stringify(request.scope_ref) ||
    binding.query_digest !== request.query_digest ||
    binding.status_filter !== request.status_filter ||
    JSON.stringify([...binding.memory_kinds].sort()) !==
      JSON.stringify([...request.memory_kinds].sort()) ||
    JSON.stringify(binding.ordering) !== JSON.stringify(request.ordering) ||
    binding.snapshot_watermark !== request.snapshot_watermark ||
    !Number.isInteger(binding.offset) ||
    binding.offset < 0
  ) {
    return fail('cursor', 'Pagination cursor binding mismatch');
  }
  return { ok: true, value: binding };
}

export { ENGRAM_MEMORY_TOOL_NAMES };
