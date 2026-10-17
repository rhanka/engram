/**
 * Normative Specification Oracle & Vendored Standard Fixtures for MCP-L0.
 *
 * Every rule in this file is encoded once from the co-frozen specification
 * `/home/antoinefa/src/graphify/.graphify/scratch/design/memory-mcp/SPEC-memory-mcp-v3.1.md`
 * (SHA-256 `f90c927964b44fdf6ad712eee9b894762250239384643a3790931c142d3aeeca`),
 * `/home/antoinefa/src/sentropic/.tmp/engram-mcp/open-points-answers-v3.1.md`,
 * and Sentropic `@sentropic/mcp-platform` (`97fe9f53e8079694e35771227c11544ce8658316`).
 *
 * Tests MUST read this fixture as their oracle and MUST NOT copy production tables
 * or compare two fields of the same production object.
 */

export const SPEC_V3_1_PROVENANCE = {
  spec_path:
    '/home/antoinefa/src/graphify/.graphify/scratch/design/memory-mcp/SPEC-memory-mcp-v3.1.md',
  spec_sha256:
    'f90c927964b44fdf6ad712eee9b894762250239384643a3790931c142d3aeeca',
  freeze_receipt_path:
    '/home/antoinefa/src/graphify/.graphify/scratch/design/memory-mcp/FREEZE-memory-mcp-v3.1.md',
  cofreeze_answers_path:
    '/home/antoinefa/src/sentropic/.tmp/engram-mcp/open-points-answers-v3.1.md',
  sentropic_mcp_platform_commit: '97fe9f53e8079694e35771227c11544ce8658316',
  sentropic_manifest_source:
    'packages/mcp-platform/src/manifest.ts',
  sentropic_elicitation_source:
    'packages/mcp-platform/src/experimental/manifest-elicitation.ts',
  neutral_contracts_checkpoint_commit: '5b18561c',
  neutral_contracts_sha256:
    '6b0c34a2745769f2c3f5a05475050b029b098c0bacd7d87f2d57a6c1ef2e9446',
} as const;

/**
 * Vendored Sentropic `@sentropic/mcp-platform` manifest & elicitation types
 * (Provenance: `/home/antoinefa/src/sentropic/packages/mcp-platform/src/manifest.ts`
 * and `src/experimental/manifest-elicitation.ts` at commit `97fe9f53e8079694e35771227c11544ce8658316`).
 */
export type { CapabilityTool as StandardCapabilityTool } from '../../src/mcp/memory/standard/manifest.js';
export type { ElicitationPolicy as StandardElicitationPolicy, AppMcpProviderManifestWithElicitation as StandardAppMcpProviderManifestWithElicitation } from '../../src/mcp/memory/standard/experimental/manifest-elicitation.js';

/**
 * M1 Surface Rules (SPEC-memory-mcp-v3.1.md lines 92–125).
 */
export const M1_SURFACE_SPEC_RULES = {
  spec_section: 'M1',
  spec_line: 92,
  tools: [
    {
      name: 'engram_memory_search',
      facet: 'MemoryRecallPortV3.recall',
      neutral_operation: 'recall_current',
      transition_operation: undefined,
      spec_line: 96,
    },
    {
      name: 'engram_memory_get',
      facet: 'MemoryReadPortV1.readCurrent',
      neutral_operation: 'recall_current',
      transition_operation: undefined,
      spec_line: 97,
    },
    {
      name: 'engram_memory_capture',
      facet: 'MemoryPortV2.capture',
      neutral_operation: 'capture',
      transition_operation: undefined,
      spec_line: 98,
    },
    {
      name: 'engram_memory_request_admission',
      facet: 'MemoryPortV2.requestAdmission',
      neutral_operation: 'request_admission',
      transition_operation: undefined,
      spec_line: 99,
    },
    {
      name: 'engram_memory_withdraw',
      facet: 'MemoryPortV2.transition',
      neutral_operation: 'withdraw',
      transition_operation: 'withdraw',
      spec_line: 100,
    },
    {
      name: 'engram_memory_forget',
      facet: 'MemoryPortV2.transition',
      neutral_operation: 'tombstone',
      transition_operation: 'tombstone',
      spec_line: 101,
    },
  ] as const,
  disclosable_states: ['accepted_current'] as const,
  non_disclosable_states: [
    'pending',
    'rejected',
    'withdrawn',
    'accepted_disputed',
    'historical',
    'expired',
    'trust_invalid',
    'tombstoned',
  ] as const,
  tombstone_allowed_from_states: [
    'accepted_current',
    'accepted_disputed',
    'historical',
    'expired',
    'trust_invalid',
  ] as const,
  excluded_internal_operations: [
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
  ] as const,
} as const;

/**
 * M2 String / Numeric / Array Boundary Rules (SPEC-memory-mcp-v3.1.md lines 234–281, 1623).
 *
 * Published schema rule (line 254):
 * For every string whose normative UTF-8 byte interval is `[min, max]`,
 * published character-count `minLength` MUST be `<= Math.ceil(min / 4)` and
 * `maxLength` MUST be `>= max` (or omitted).
 */
export interface StringBoundaryRuleFixture {
  readonly id: string;
  readonly field_path: string;
  readonly spec_section: 'M2';
  readonly spec_line: number;
  readonly min_utf8_bytes: number;
  readonly max_utf8_bytes: number;
  readonly max_allowed_schema_min_length: number;
  readonly min_required_schema_max_length: number;
  readonly requires_nfc: boolean;
  readonly is_ascii_grammar: boolean;
  readonly exact_limit_ascii: string;
  readonly over_limit_ascii: string;
  readonly exact_min_multibyte?: string;
  readonly exact_min_four_byte?: string;
  readonly exact_max_multibyte?: string;
  readonly over_max_multibyte?: string;
  readonly non_ascii_rejection_sample?: string;
  readonly empty_value: '';
}

export const M2_STRING_BOUNDARY_SPEC_RULES: readonly StringBoundaryRuleFixture[] =
  [
    {
      id: 'M2-STR-IDEMPOTENCY-KEY',
      field_path: 'idempotency_key',
      spec_section: 'M2',
      spec_line: 242,
      min_utf8_bytes: 16,
      max_utf8_bytes: 256,
      max_allowed_schema_min_length: 4, // ceil(16 / 4) = 4 (line 256)
      min_required_schema_max_length: 256,
      requires_nfc: true,
      is_ascii_grammar: false,
      exact_limit_ascii: 'k'.repeat(256),
      over_limit_ascii: 'k'.repeat(257),
      exact_min_multibyte: 'é'.repeat(8), // 8 chars = 16 UTF-8 bytes (line 256)
      exact_min_four_byte: '😀'.repeat(4), // 4 chars = 16 UTF-8 bytes (line 256)
      exact_max_multibyte: 'é'.repeat(128), // 128 chars = 256 UTF-8 bytes (line 256)
      over_max_multibyte: 'é'.repeat(129), // 129 chars = 258 UTF-8 bytes (line 256)
      empty_value: '',
    },
    {
      id: 'M2-STR-QUERY',
      field_path: 'query',
      spec_section: 'M2',
      spec_line: 238,
      min_utf8_bytes: 1,
      max_utf8_bytes: 8192,
      max_allowed_schema_min_length: 1,
      min_required_schema_max_length: 8192,
      requires_nfc: false,
      is_ascii_grammar: false,
      exact_limit_ascii: 'q'.repeat(8192),
      over_limit_ascii: 'q'.repeat(8193),
      exact_min_multibyte: 'é',
      exact_max_multibyte: 'é'.repeat(4096), // 8192 UTF-8 bytes
      over_max_multibyte: 'é'.repeat(4096) + 'a', // 8193 UTF-8 bytes
      empty_value: '',
    },
    {
      id: 'M2-STR-PURPOSE-REF',
      field_path: 'purpose_ref',
      spec_section: 'M2',
      spec_line: 241,
      min_utf8_bytes: 1,
      max_utf8_bytes: 512,
      max_allowed_schema_min_length: 1,
      min_required_schema_max_length: 512,
      requires_nfc: true,
      is_ascii_grammar: false,
      exact_limit_ascii: 'p'.repeat(512),
      over_limit_ascii: 'p'.repeat(513),
      exact_min_multibyte: 'é',
      exact_max_multibyte: 'é'.repeat(256), // 512 UTF-8 bytes
      over_max_multibyte: 'é'.repeat(256) + 'a', // 513 UTF-8 bytes
      empty_value: '',
    },
    {
      id: 'M2-STR-CANDIDATE-ID',
      field_path: 'candidate_id',
      spec_section: 'M2',
      spec_line: 244,
      min_utf8_bytes: 1,
      max_utf8_bytes: 512,
      max_allowed_schema_min_length: 1,
      min_required_schema_max_length: 512,
      requires_nfc: false,
      is_ascii_grammar: false,
      exact_limit_ascii: 'c'.repeat(512),
      over_limit_ascii: 'c'.repeat(513),
      exact_min_multibyte: 'é',
      exact_max_multibyte: 'é'.repeat(256),
      over_max_multibyte: 'é'.repeat(256) + 'a',
      empty_value: '',
    },
    {
      id: 'M2-STR-REASON-REF',
      field_path: 'reason_ref',
      spec_section: 'M2',
      spec_line: 241,
      min_utf8_bytes: 1,
      max_utf8_bytes: 512,
      max_allowed_schema_min_length: 1,
      min_required_schema_max_length: 512,
      requires_nfc: true,
      is_ascii_grammar: false,
      exact_limit_ascii: 'r'.repeat(512),
      over_limit_ascii: 'r'.repeat(513),
      exact_min_multibyte: 'é',
      exact_max_multibyte: 'é'.repeat(256),
      over_max_multibyte: 'é'.repeat(256) + 'a',
      empty_value: '',
    },
    {
      id: 'M2-STR-CITATION-ID',
      field_path: 'payload.citations[].citation_id',
      spec_section: 'M2',
      spec_line: 266,
      min_utf8_bytes: 1,
      max_utf8_bytes: 512,
      max_allowed_schema_min_length: 1,
      min_required_schema_max_length: 512,
      requires_nfc: true,
      is_ascii_grammar: false,
      exact_limit_ascii: 'c'.repeat(512),
      over_limit_ascii: 'c'.repeat(513),
      exact_min_multibyte: 'é',
      exact_max_multibyte: 'é'.repeat(256), // line 281: 256 NFC é = 512 bytes
      over_max_multibyte: 'é'.repeat(256) + 'a', // line 281: 513 bytes rejected
      empty_value: '',
    },
    {
      id: 'M2-STR-CITATION-SOURCE-REF',
      field_path: 'payload.citations[].source_ref',
      spec_section: 'M2',
      spec_line: 267,
      min_utf8_bytes: 1,
      max_utf8_bytes: 512,
      max_allowed_schema_min_length: 1,
      min_required_schema_max_length: 512,
      requires_nfc: true,
      is_ascii_grammar: false,
      exact_limit_ascii: 's'.repeat(512),
      over_limit_ascii: 's'.repeat(513),
      exact_min_multibyte: 'é',
      exact_max_multibyte: 'é'.repeat(256),
      over_max_multibyte: 'é'.repeat(256) + 'a',
      empty_value: '',
    },
    {
      id: 'M2-STR-LOCATOR-SCHEME',
      field_path: 'payload.citations[].locator.scheme',
      spec_section: 'M2',
      spec_line: 268,
      min_utf8_bytes: 1,
      max_utf8_bytes: 512,
      max_allowed_schema_min_length: 1,
      min_required_schema_max_length: 512,
      requires_nfc: false, // M2:268 "Nonempty well-formed string"; M5:688 preserves other body strings.
      is_ascii_grammar: false,
      exact_limit_ascii: 'l'.repeat(512),
      over_limit_ascii: 'l'.repeat(513),
      exact_min_multibyte: 'é',
      exact_max_multibyte: 'é'.repeat(256),
      over_max_multibyte: 'é'.repeat(256) + 'a',
      empty_value: '',
    },
    {
      id: 'M2-STR-LOCATOR-VALUE',
      field_path: 'payload.citations[].locator.value',
      spec_section: 'M2',
      spec_line: 269,
      min_utf8_bytes: 1,
      max_utf8_bytes: 512,
      max_allowed_schema_min_length: 1,
      min_required_schema_max_length: 512,
      requires_nfc: false, // M2:269 "Nonempty well-formed string"; M5:688 preserves other body strings.
      is_ascii_grammar: false,
      exact_limit_ascii: 'v'.repeat(512),
      over_limit_ascii: 'v'.repeat(513),
      exact_min_multibyte: 'é',
      exact_max_multibyte: 'é'.repeat(256),
      over_max_multibyte: 'é'.repeat(256) + 'a',
      empty_value: '',
    },
    {
      id: 'M2-STR-COMPONENT-ID',
      field_path: 'payload.components[].component_id',
      spec_section: 'M2',
      spec_line: 272,
      min_utf8_bytes: 1,
      max_utf8_bytes: 512,
      max_allowed_schema_min_length: 1,
      min_required_schema_max_length: 512,
      requires_nfc: true,
      is_ascii_grammar: false,
      exact_limit_ascii: 'm'.repeat(512),
      over_limit_ascii: 'm'.repeat(513),
      exact_min_multibyte: 'é',
      exact_max_multibyte: 'é'.repeat(256),
      over_max_multibyte: 'é'.repeat(256) + 'a',
      empty_value: '',
    },
    {
      id: 'M2-STR-COMPONENT-TEXT',
      field_path: 'payload.components[].text',
      spec_section: 'M2',
      spec_line: 274,
      min_utf8_bytes: 1,
      max_utf8_bytes: 65536,
      max_allowed_schema_min_length: 1,
      min_required_schema_max_length: 65536,
      requires_nfc: false, // M2:274 "Content is preserved, without implicit Unicode normalization."
      is_ascii_grammar: false,
      exact_limit_ascii: 't'.repeat(65536),
      over_limit_ascii: 't'.repeat(65537),
      exact_min_multibyte: 'é',
      exact_max_multibyte: 'é'.repeat(32768), // line 281: 32,768 é = 65,536 bytes
      over_max_multibyte: 'é'.repeat(32768) + 'a', // 65,537 bytes
      empty_value: '',
    },
    {
      id: 'M2-STR-RECORD-ID',
      field_path: 'record_id',
      spec_section: 'M2',
      spec_line: 243,
      min_utf8_bytes: 5,
      max_utf8_bytes: 512,
      max_allowed_schema_min_length: 1,
      min_required_schema_max_length: 512,
      requires_nfc: true,
      is_ascii_grammar: true,
      exact_limit_ascii: 'mem_' + 'a'.repeat(508),
      over_limit_ascii: 'mem_' + 'a'.repeat(509),
      non_ascii_rejection_sample: 'mem_éaaaa',
      empty_value: '',
    },
    {
      id: 'M2-STR-DIGEST',
      field_path: 'content_digest',
      spec_section: 'M2',
      spec_line: 270,
      min_utf8_bytes: 71,
      max_utf8_bytes: 71,
      max_allowed_schema_min_length: 71,
      min_required_schema_max_length: 71,
      requires_nfc: true,
      is_ascii_grammar: true,
      exact_limit_ascii: 'sha256:' + 'a'.repeat(64),
      over_limit_ascii: 'sha256:' + 'a'.repeat(65),
      non_ascii_rejection_sample: 'sha256:' + 'é'.repeat(32),
      empty_value: '',
    },
    {
      id: 'M2-STR-INSTANT',
      field_path: 'observed_at',
      spec_section: 'M2',
      spec_line: 271,
      min_utf8_bytes: 24,
      max_utf8_bytes: 24,
      max_allowed_schema_min_length: 24,
      min_required_schema_max_length: 24,
      requires_nfc: true,
      is_ascii_grammar: true,
      exact_limit_ascii: '2026-10-17T12:00:00.000Z',
      over_limit_ascii: '2026-10-17T12:00:00.0000Z',
      non_ascii_rejection_sample: '2026-10-17T12:00:00.00éZ',
      empty_value: '',
    },
  ] as const;

/** M2:241,272-277: every remaining opaque candidate reference uses the same byte budget. */
export const M2_ADDITIONAL_STRING_BOUNDARY_SPEC_RULES: readonly StringBoundaryRuleFixture[] = [
  ['payload.purpose_ref', 241], ['payload.primary_component_id', 276],
  ['payload.primary_event.type_ref', 277], ['payload.primary_event.citation_id', 277],
  ['payload.components[].citation_ids[]', 275], ['evidence.evidence_ref', 241], ['evidence.citation_ids[]', 241],
].map(([field_path, spec_line]) => ({
  id: 'M2-STR-' + field_path, field_path: String(field_path), spec_section: 'M2' as const, spec_line: Number(spec_line),
  min_utf8_bytes: 1, max_utf8_bytes: 512, max_allowed_schema_min_length: 1, min_required_schema_max_length: 512,
  requires_nfc: true, is_ascii_grammar: false, exact_limit_ascii:'r'.repeat(512), over_limit_ascii:'r'.repeat(513),
  exact_min_multibyte:'é', exact_max_multibyte:'é'.repeat(256), over_max_multibyte:'é'.repeat(256)+'a', empty_value:'' as const,
}));

export const M2_NUMERIC_AND_ARRAY_BOUNDARY_SPEC_RULES = {
  spec_section: 'M2',
  spec_line: 236,
  limit: {
    min: 1,
    max: 50,
    default: 10,
    below_min: 0,
    above_max: 51,
    spec_line: 239,
  },
  max_packet_bytes: {
    min: 4096,
    max: 1048576,
    default: 65536,
    below_min: 4095,
    above_max: 1048577,
    spec_line: 240,
  },
  components_array: {
    min_items: 1,
    max_items: 64,
    below_min: 0,
    above_max: 65,
    spec_line: 248,
  },
  citations_array: {
    min_items: 1,
    max_items: 256,
    below_min: 0,
    above_max: 257,
    spec_line: 248,
  },
  component_citation_ids_array: {
    min_items: 1,
    max_items: 256,
    below_min: 0,
    above_max: 257,
    spec_line: 275,
  },
  reconciliation_family_refs_array: {
    min_items: 0,
    max_items: 64,
    above_max: 65,
    spec_line: 213,
  },
  argument_object_max_utf8_bytes: {
    max: 1048576,
    above_max: 1048577,
    spec_line: 249,
  },
  transport_combined_max_utf8_bytes: {
    max: 2097152,
    above_max: 2097153,
    spec_line: 334,
  },
  execution_deadline_max_ms: {
    max: 30000,
    above_max: 30001,
    spec_line: 250,
  },
  confirmation_max_ttl_seconds: {
    max: 300,
    above_max: 301,
    spec_line: 563,
  },
} as const;

/**
 * M4 Closed-World Literal-True Authorization Rules
 * (SPEC-memory-mcp-v3.1.md lines 523–530, 1624).
 */
export const M4_CLOSED_WORLD_AUTHZ_SPEC_RULES = {
  spec_section: 'M4',
  spec_line: 523,
  accepted_verdict: true as const,
  rejected_verdicts: [undefined, false, null, 'true', 1, 0, ''] as const,
  rules: [
    {
      id: 'A10-R2-IDEMPOTENT-CALLER-AUTHZ',
      target_function: 'evaluateIdempotentMutationStateV1',
      field: 'callerAuthorized',
      spec_line: 525,
      expected_refusal_on_capture: 'UNAUTHORIZED',
      expected_refusal_on_target_tool: 'NOT_FOUND',
    },
    {
      id: 'A10-R2-IDEMPOTENT-TARGET-AUTHZ',
      target_function: 'evaluateIdempotentMutationStateV1',
      field: 'targetAuthorized',
      spec_line: 528,
      expected_refusal_on_target_tool: 'NOT_FOUND',
    },
    {
      id: 'A10-R2-PAGINATION-REAUTHORIZED',
      target_function: 'validatePaginationHandleStateV1',
      field: 'reauthorized',
      spec_line: 527,
      expected_refusal_code: 'STALE_PAGE',
    },
    {
      id: 'A10-R2-TARGET-DISCLOSURE-AUTHZ',
      target_function: 'mapNeutralMemoryErrorToPublic',
      field: 'targetAuthorized',
      spec_line: 528,
      source_code: 'ALREADY_TERMINAL',
      expected_public_code_when_not_literal_true: 'NOT_FOUND',
      expected_public_code_when_literal_true: 'ALREADY_TERMINAL',
    },
    {
      id: 'A10-R2-CONFIRMATION-APPROVED',
      target_function: 'verifyDestructiveConfirmationGrantV1',
      field: 'response.approved',
      spec_line: 529,
      expected_refusal_code: 'gate_failed',
    },
    {
      id: 'A10-R2-CONTINUATION-ASSURANCE',
      target_function: 'verifyMemoryConfirmationContinuationV1',
      fields: [
        'assurance.authenticated',
        'assurance.enrolled_2fa',
        'assurance.step_up_assurance_verified',
        'approved',
      ] as const,
      spec_line: 559,
      expected_refusal_code: 'gate_failed',
    },
  ] as const,
} as const;

/**
 * M5 Lifecycle Transition & Tombstone Recapture Table
 * (SPEC-memory-mcp-v3.1.md lines 577–588, 692–698, 712–729, 1391, 1626).
 */
export interface M5LifecycleTransitionRuleFixture {
  readonly id: string;
  readonly spec_section: 'M5';
  readonly spec_line: number;
  readonly tool:
    | 'engram_memory_capture'
    | 'engram_memory_request_admission'
    | 'engram_memory_withdraw'
    | 'engram_memory_forget';
  readonly prior_state:
    | 'absent'
    | 'pending'
    | 'accepted_current'
    | 'accepted_disputed'
    | 'historical'
    | 'expired'
    | 'trust_invalid'
    | 'rejected'
    | 'withdrawn'
    | 'tombstoned';
  readonly same_scope_tombstone_match?: boolean;
  readonly other_scope_tombstone_match?: boolean;
  readonly policy_decision?: 'accept' | 'reject' | 'adjudication_required';
  readonly expected_ok: boolean;
  readonly expected_is_error: boolean;
  readonly expected_next_state?:
    | 'pending'
    | 'accepted_current'
    | 'rejected'
    | 'pending_adjudication'
    | 'withdrawn'
    | 'tombstoned';
  readonly expected_admission_status?:
    | 'accepted'
    | 'rejected'
    | 'pending_adjudication';
  readonly expected_error_code?: 'ILLEGAL_TRANSITION' | 'ALREADY_TERMINAL';
}

export const M5_LIFECYCLE_TABLE_SPEC_RULES: readonly M5LifecycleTransitionRuleFixture[] =
  [
    {
      id: 'M5-CAPTURE-ABSENT-TO-PENDING',
      spec_section: 'M5',
      spec_line: 581,
      tool: 'engram_memory_capture',
      prior_state: 'absent',
      expected_ok: true,
      expected_is_error: false,
      expected_next_state: 'pending',
    },
    {
      id: 'M5-ADMISSION-PENDING-TO-ACCEPTED',
      spec_section: 'M5',
      spec_line: 582,
      tool: 'engram_memory_request_admission',
      prior_state: 'pending',
      same_scope_tombstone_match: false,
      policy_decision: 'accept',
      expected_ok: true,
      expected_is_error: false,
      expected_next_state: 'accepted_current',
      expected_admission_status: 'accepted',
    },
    {
      id: 'M5-ADMISSION-PENDING-TO-REJECTED',
      spec_section: 'M5',
      spec_line: 582,
      tool: 'engram_memory_request_admission',
      prior_state: 'pending',
      same_scope_tombstone_match: false,
      policy_decision: 'reject',
      expected_ok: true,
      expected_is_error: false,
      expected_next_state: 'rejected',
      expected_admission_status: 'rejected',
    },
    {
      id: 'M5-ADMISSION-PENDING-TO-ADJUDICATION',
      spec_section: 'M5',
      spec_line: 582,
      tool: 'engram_memory_request_admission',
      prior_state: 'pending',
      same_scope_tombstone_match: false,
      policy_decision: 'adjudication_required',
      expected_ok: true,
      expected_is_error: false,
      expected_next_state: 'pending_adjudication',
      expected_admission_status: 'pending_adjudication',
    },
    {
      id: 'A10-R4-RECAPTURE-SAME-SCOPE-TOMBSTONE',
      spec_section: 'M5',
      spec_line: 716,
      tool: 'engram_memory_request_admission',
      prior_state: 'pending',
      same_scope_tombstone_match: true,
      policy_decision: 'accept',
      expected_ok: true,
      expected_is_error: false,
      expected_next_state: 'pending_adjudication',
      expected_admission_status: 'pending_adjudication',
    },
    {
      id: 'M5-RECAPTURE-OTHER-SCOPE-TOMBSTONE-IGNORED',
      spec_section: 'M5',
      spec_line: 724,
      tool: 'engram_memory_request_admission',
      prior_state: 'pending',
      same_scope_tombstone_match: false,
      other_scope_tombstone_match: true,
      policy_decision: 'accept',
      expected_ok: true,
      expected_is_error: false,
      expected_next_state: 'accepted_current',
      expected_admission_status: 'accepted',
    },
    {
      id: 'M5-ADMISSION-ON-WITHDRAWN-CANDIDATE',
      spec_section: 'M5',
      spec_line: 586,
      tool: 'engram_memory_request_admission',
      prior_state: 'withdrawn',
      policy_decision: 'accept',
      expected_ok: false,
      expected_is_error: true,
      expected_error_code: 'ALREADY_TERMINAL',
    },
    {
      id: 'M5-WITHDRAW-PENDING-TO-WITHDRAWN',
      spec_section: 'M5',
      spec_line: 583,
      tool: 'engram_memory_withdraw',
      prior_state: 'pending',
      expected_ok: true,
      expected_is_error: false,
      expected_next_state: 'withdrawn',
    },
    {
      id: 'M5-WITHDRAW-AFTER-ADMISSION-WINS-RACE',
      spec_section: 'M5',
      spec_line: 586,
      tool: 'engram_memory_withdraw',
      prior_state: 'accepted_current',
      expected_ok: false,
      expected_is_error: true,
      expected_error_code: 'ILLEGAL_TRANSITION',
    },
    {
      id: 'M5-WITHDRAW-ALREADY-WITHDRAWN',
      spec_section: 'M5',
      spec_line: 583,
      tool: 'engram_memory_withdraw',
      prior_state: 'withdrawn',
      expected_ok: false,
      expected_is_error: true,
      expected_error_code: 'ALREADY_TERMINAL',
    },
    {
      id: 'M5-FORGET-ACCEPTED-CURRENT-TO-TOMBSTONED',
      spec_section: 'M5',
      spec_line: 584,
      tool: 'engram_memory_forget',
      prior_state: 'accepted_current',
      expected_ok: true,
      expected_is_error: false,
      expected_next_state: 'tombstoned',
    },
    {
      id: 'M5-FORGET-ACCEPTED-DISPUTED-TO-TOMBSTONED',
      spec_section: 'M5',
      spec_line: 584,
      tool: 'engram_memory_forget',
      prior_state: 'accepted_disputed',
      expected_ok: true,
      expected_is_error: false,
      expected_next_state: 'tombstoned',
    },
    {
      id: 'M5-FORGET-HISTORICAL-TO-TOMBSTONED',
      spec_section: 'M5',
      spec_line: 584,
      tool: 'engram_memory_forget',
      prior_state: 'historical',
      expected_ok: true,
      expected_is_error: false,
      expected_next_state: 'tombstoned',
    },
    {
      id: 'M5-FORGET-EXPIRED-TO-TOMBSTONED',
      spec_section: 'M5',
      spec_line: 584,
      tool: 'engram_memory_forget',
      prior_state: 'expired',
      expected_ok: true,
      expected_is_error: false,
      expected_next_state: 'tombstoned',
    },
    {
      id: 'M5-FORGET-TRUST-INVALID-TO-TOMBSTONED',
      spec_section: 'M5',
      spec_line: 584,
      tool: 'engram_memory_forget',
      prior_state: 'trust_invalid',
      expected_ok: true,
      expected_is_error: false,
      expected_next_state: 'tombstoned',
    },
    {
      id: 'M5-FORGET-PENDING-ILLEGAL',
      spec_section: 'M5',
      spec_line: 584,
      tool: 'engram_memory_forget',
      prior_state: 'pending',
      expected_ok: false,
      expected_is_error: true,
      expected_error_code: 'ILLEGAL_TRANSITION',
    },
    {
      id: 'M5-FORGET-ALREADY-TOMBSTONED',
      spec_section: 'M5',
      spec_line: 584,
      tool: 'engram_memory_forget',
      prior_state: 'tombstoned',
      expected_ok: false,
      expected_is_error: true,
      expected_error_code: 'ALREADY_TERMINAL',
    },
  ] as const;

export const M5_CROSS_TOOL_KEY_SPEC_RULES = {
  id: 'M5-CROSS-TOOL-KEY',
  spec_section: 'M5',
  spec_line: 694,
  lookup_key_fields: [
    'principal_namespace',
    'principal_id',
    'tenant_id',
    'store_id',
    'provider_id',
    'connector_id',
    'connector_instance_ref',
    'scope_ref',
    'idempotency_key',
  ] as const,
  excluded_from_lookup_key: [
    'tool_name',
    'tool_contract_version',
    'target',
    'target_ref',
    'operation_digest',
    'normalized_input_digest',
  ] as const,
  conflict_pairs: [
    {
      first_tool: 'engram_memory_capture',
      second_tool: 'engram_memory_withdraw',
      expected_error_code: 'DIGEST_CONFLICT',
      spec_line: 698,
    },
    {
      first_tool: 'engram_memory_capture',
      second_tool: 'engram_memory_request_admission',
      expected_error_code: 'DIGEST_CONFLICT',
      spec_line: 698,
    },
    {
      first_tool: 'engram_memory_request_admission',
      second_tool: 'engram_memory_forget',
      expected_error_code: 'DIGEST_CONFLICT',
      spec_line: 698,
    },
  ] as const,
} as const;

/**
 * M2 / M6 Missing Audit Protocol Refusal & Total Error Mapping Rules
 * (SPEC-memory-mcp-v3.1.md lines 320–327, 748–815, 1627).
 */
export const M2_AUDIT_MISSING_SPEC_RULE = {
  id: 'A10-R5-AUDIT',
  fixture_id: 'M2-AUDIT-MISSING',
  spec_section: 'M2',
  spec_line: 323,
  protocol_error_code: -32603 as const,
  protocol_error_message: 'Trusted invocation context unavailable' as const,
  forbidden_fallback_audit_id: 'audit_mcp_l0_default' as const,
  domain_envelope_allowed_when_audit_missing: false as const,
} as const;

export interface ErrorSpecRuleFixture {
  readonly code: string;
  readonly retriable: boolean;
  readonly requires_target_authorization_for_detail: boolean;
  readonly spec_line: number;
}

export const M6_ERROR_MAPPING_SPEC_RULES: readonly ErrorSpecRuleFixture[] = [
  { code: 'INVALID_SCHEMA', retriable: false, requires_target_authorization_for_detail: false, spec_line: 753 },
  { code: 'INVALID_DIGEST', retriable: false, requires_target_authorization_for_detail: false, spec_line: 754 },
  { code: 'DIGEST_CONFLICT', retriable: false, requires_target_authorization_for_detail: true, spec_line: 755 },
  { code: 'UNAUTHORIZED', retriable: false, requires_target_authorization_for_detail: true, spec_line: 756 },
  { code: 'AUTHORIZATION_EXPIRED', retriable: false, requires_target_authorization_for_detail: true, spec_line: 757 },
  { code: 'AUTHORIZATION_REVOKED', retriable: false, requires_target_authorization_for_detail: true, spec_line: 758 },
  { code: 'POLICY_UNAVAILABLE', retriable: true, requires_target_authorization_for_detail: false, spec_line: 759 },
  { code: 'POLICY_STALE', retriable: true, requires_target_authorization_for_detail: false, spec_line: 760 },
  { code: 'ILLEGAL_TRANSITION', retriable: false, requires_target_authorization_for_detail: true, spec_line: 761 },
  { code: 'NOT_FOUND', retriable: false, requires_target_authorization_for_detail: false, spec_line: 762 },
  { code: 'ALREADY_TERMINAL', retriable: false, requires_target_authorization_for_detail: true, spec_line: 763 },
  { code: 'DEADLINE_EXCEEDED', retriable: true, requires_target_authorization_for_detail: false, spec_line: 764 },
  { code: 'CANCELLED', retriable: true, requires_target_authorization_for_detail: false, spec_line: 765 },
  { code: 'CAPABILITY_UNAVAILABLE', retriable: false, requires_target_authorization_for_detail: false, spec_line: 766 },
  { code: 'STORE_UNAVAILABLE', retriable: true, requires_target_authorization_for_detail: false, spec_line: 767 },
  { code: 'FENCE_LOST', retriable: true, requires_target_authorization_for_detail: false, spec_line: 768 },
  { code: 'CURSOR_GAP', retriable: true, requires_target_authorization_for_detail: false, spec_line: 769 },
  { code: 'JOURNAL_CORRUPT', retriable: false, requires_target_authorization_for_detail: false, spec_line: 770 },
  { code: 'BLOB_MISSING', retriable: false, requires_target_authorization_for_detail: true, spec_line: 771 },
  { code: 'PROJECTION_STALE', retriable: true, requires_target_authorization_for_detail: false, spec_line: 772 },
  { code: 'PROJECTION_OVERSIZED', retriable: false, requires_target_authorization_for_detail: false, spec_line: 773 },
  { code: 'RANKING_UNAVAILABLE', retriable: true, requires_target_authorization_for_detail: false, spec_line: 774 },
  { code: 'STALE_PAGE', retriable: false, requires_target_authorization_for_detail: false, spec_line: 775 },
  { code: 'REGISTRY_VERSION_UNAVAILABLE', retriable: false, requires_target_authorization_for_detail: false, spec_line: 776 },
  { code: 'BACKUP_INVALID', retriable: false, requires_target_authorization_for_detail: false, spec_line: 777 },
  { code: 'RESTORE_REFUSED', retriable: false, requires_target_authorization_for_detail: false, spec_line: 778 },
  { code: 'MIGRATION_LEDGER_INVALID', retriable: false, requires_target_authorization_for_detail: false, spec_line: 779 },
  { code: 'RESULT_TOO_LARGE', retriable: false, requires_target_authorization_for_detail: false, spec_line: 780 },
  { code: 'RATE_LIMITED', retriable: true, requires_target_authorization_for_detail: false, spec_line: 781 },
  { code: 'MUTATION_OUTCOME_UNKNOWN', retriable: true, requires_target_authorization_for_detail: false, spec_line: 782 },
  { code: 'gate_failed', retriable: false, requires_target_authorization_for_detail: false, spec_line: 783 },
] as const;

/**
 * M7 Normative Provider Manifest, CapabilityTool Descriptors, Elicitation
 * Confirm Entries, and Catalog Projection (SPEC-memory-mcp-v3.1.md lines 817–1089, 1625).
 */
export const M7_MANIFEST_AND_DESCRIPTORS_SPEC_RULE = {
  id: 'A10-R3-STANDARD',
  spec_section: 'M7',
  spec_line: 835,
  manifest: {
    appId: 'engram',
    providerId: 'sentropic.engram.memory',
    version: '1.0.0',
    displayName: 'Engram Memory',
    resources: [] as const,
    prompts: [] as const,
    authz: {
      requiredClaims: ['sub', 'tid'] as const,
      scopes: ['mcp:discover', 'mcp:tools:invoke'] as const,
      tenantResolution: 'custom-resolver' as const,
    },
    audit: {
      eventKinds: ['invoke'] as const,
      piiClass: 'high' as const,
    },
    durability: {} as const,
    secrets: [] as const,
  },
  elicitation: [
    {
      capabilityRef: 'engram_memory_withdraw',
      mode: 'confirm',
      required: true,
      ttlSeconds: 300,
      carriesSecrets: false,
      bindToClient: true,
      bindToSub: true,
      spec_line: 874,
    },
    {
      capabilityRef: 'engram_memory_forget',
      mode: 'confirm',
      required: true,
      ttlSeconds: 300,
      carriesSecrets: false,
      bindToClient: true,
      bindToSub: true,
      spec_line: 893,
    },
  ] as const,
  tools: [
    {
      kind: 'tool',
      name: 'engram_memory_search',
      description:
        'Search authorized current memory with citations and ranking receipts.',
      requiredScopes: ['mcp:tools:invoke'] as const,
      requiredClaims: ['sub', 'tid'] as const,
      redactionClass: 'high',
      mutability: 'read-only',
      category: 'read',
      mutatesExternalSystem: false,
      idempotency: { required: false } as const,
      gates: {
        requiresElicitation: false,
        requiresHumanConfirmation: false,
        requiresPrincipalGate: false,
        requiresPolicy: true,
      },
      spec_line: 916,
    },
    {
      kind: 'tool',
      name: 'engram_memory_get',
      description:
        'Read one authorized currently eligible canonical memory record.',
      requiredScopes: ['mcp:tools:invoke'] as const,
      requiredClaims: ['sub', 'tid'] as const,
      redactionClass: 'high',
      mutability: 'read-only',
      category: 'read',
      mutatesExternalSystem: false,
      idempotency: { required: false } as const,
      gates: {
        requiresElicitation: false,
        requiresHumanConfirmation: false,
        requiresPrincipalGate: false,
        requiresPolicy: true,
      },
      spec_line: 938,
    },
    {
      kind: 'tool',
      name: 'engram_memory_capture',
      description:
        'Durably submit cited material as an encrypted pending candidate.',
      requiredScopes: ['mcp:tools:invoke'] as const,
      requiredClaims: ['sub', 'tid'] as const,
      redactionClass: 'high',
      mutability: 'append',
      category: 'write',
      mutatesExternalSystem: true,
      idempotency: { required: true, scope: 'principal' } as const,
      gates: {
        requiresElicitation: false,
        requiresHumanConfirmation: false,
        requiresPrincipalGate: false,
        requiresPolicy: true,
      },
      spec_line: 960,
    },
    {
      kind: 'tool',
      name: 'engram_memory_request_admission',
      description:
        'Request the configured admission policy decision for a pending candidate.',
      requiredScopes: ['mcp:tools:invoke'] as const,
      requiredClaims: ['sub', 'tid'] as const,
      redactionClass: 'high',
      mutability: 'state-transition',
      category: 'write',
      mutatesExternalSystem: true,
      idempotency: { required: true, scope: 'principal' } as const,
      gates: {
        requiresElicitation: false,
        requiresHumanConfirmation: false,
        requiresPrincipalGate: false,
        requiresPolicy: true,
      },
      spec_line: 982,
    },
    {
      kind: 'tool',
      name: 'engram_memory_withdraw',
      description: 'Withdraw an authorized pending candidate with confirmed key-destruction status.',
      requiredScopes: ['mcp:tools:invoke'] as const,
      requiredClaims: ['sub', 'tid'] as const,
      redactionClass: 'high',
      mutability: 'state-transition',
      category: 'write',
      mutatesExternalSystem: true,
      idempotency: { required: true, scope: 'principal' } as const,
      gates: {
        requiresElicitation: false,
        requiresHumanConfirmation: true,
        requiresPrincipalGate: false,
        requiresPolicy: true,
      },
      spec_line: 1004,
    },
    {
      kind: 'tool',
      name: 'engram_memory_forget',
      description:
        'Forget an authorized admitted memory with accurate cleanup status.',
      requiredScopes: ['mcp:tools:invoke'] as const,
      requiredClaims: ['sub', 'tid'] as const,
      redactionClass: 'high',
      mutability: 'state-transition',
      category: 'write',
      mutatesExternalSystem: true,
      idempotency: { required: true, scope: 'principal' } as const,
      gates: {
        requiresElicitation: false,
        requiresHumanConfirmation: true,
        requiresPrincipalGate: false,
        requiresPolicy: true,
      },
      spec_line: 1026,
    },
  ] as const,
  search_catalog_entry: {
    kind: 'tool',
    sourceId: 'mcp:engram-memory',
    metadata: {
      name: 'engram_memory_search',
      description:
        'Search authorized current memory with citations and ranking receipts.',
      version: '1.0.0',
      category: 'mcp',
      authzRequirements: {
        permissions: ['engram_memory_search'] as const,
      },
    },
    rawName: 'engram_memory_search',
    tool: {
      name: 'engram_memory_search',
      description:
        'Search authorized current memory with citations and ranking receipts.',
      sideEffect: false,
      requiresApproval: false,
    },
    gates: {
      requiresElicitation: false,
      requiresHumanConfirmation: false,
      requiresPrincipalGate: false,
      requiresPolicy: true,
    },
    spec_line: 1064,
  },
} as const;

/**
 * L0-A01..A09 & M14 Co-Frozen v3.1 Additions (SPEC-memory-mcp-v3.1.md lines 1604–1686).
 */
export const A01_PUBLISHER_SPEC_RULE = {
  id: 'L0-A01',
  spec_section: 'M7',
  spec_line: 1606,
  registry_schema_version: '1.1.4',
  publisher_entry_id: 'sentropic.engram.memory',
  provider_id: 'sentropic.engram.memory',
  connector_id: 'engram-memory',
  app_id: 'engram',
  entry_version: '1.0.0',
  manifest_version: '1.0.0',
  provider_behavioral_contract_version: '1.0.0',
  publisher_package_name: '@sentropic/engram',
  entries_asset_path: 'registry/entries.v1.json',
  manifest_export_subpath: './registry/manifest',
  definitions_export_subpath: './registry/definitions',
  mcp_memory_export_subpath: './mcp-memory',
  tool_schema_profile: 'sentropic.engram.memory-tools/2020-12-v1',
  parameter_schema_profile: 'sentropic.parameters/2020-12-bounded-v1',
  selected_release_option: 'B',
  adapter_delivering_version_in_0_20_0: null,
  later_b_adapter_version_status: 'unverified',
} as const;

export const A02_LOCAL_DEFINITION_SPEC_RULE = {
  id: 'L0-A02',
  spec_section: 'M7',
  spec_line: 1607,
  definition_export_name: 'memoryDefinition',
  definitions_subpath: './registry/definitions',
  literal_loader_target: './mcp-memory',
  parameter_profile: 'sentropic.parameters/2020-12-bounded-v1',
  mode_const: 'embedded-local',
  host_binding_ref_min_ascii: 1,
  host_binding_ref_max_ascii: 128,
  host_binding_ref_pattern: '^[a-z0-9][a-z0-9._-]*$',
  required_binding_ports: [
    'invocation',
    'authorization',
    'domainPolicy',
    'engine',
    'mutationRecovery',
    'confirmation',
    'audit',
    'pagination',
    'lifecycle',
  ] as const,
} as const;

export const A03_CONTEXT_PROJECTION_SPEC_RULE = {
  id: 'L0-A03',
  spec_section: 'M4',
  spec_line: 1608,
  cofreeze_answers_line: 10,
  required_claims: ['sub', 'tid'] as const,
  forbidden_public_types: ['ScopeRefV1', 'PrincipalRefV1'] as const,
  forbidden_shortcuts: ['claims:[]', 'workspaceId_as_tenantId'] as const,
  authorization_context_allowed_keys: ['credential', 'context_ref'] as const,
} as const;

export const A04_WIRE_PROFILE_SPEC_RULE = {
  id: 'L0-A04',
  spec_section: 'M2',
  spec_line: 1609,
  wire_profile_id: 'sentropic.engram.memory-wire/v1',
  schema_profile_id: 'sentropic.engram.memory-tools/2020-12-v1',
  json_schema_dialect: 'https://json-schema.org/draft/2020-12/schema',
  allowed_assertion_keywords: [
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
  ] as const,
  allowed_annotation_keywords: [
    '$schema',
    '$id',
    'title',
    'description',
    'default',
  ] as const,
  combined_transport_ceiling_utf8_bytes: 2097152,
  max_packet_bytes_default: 65536,
  max_packet_bytes_max: 1048576,
  mcp_sdk_min_version: '1.31.0',
} as const;

export const A05_MUTATION_DIGEST_VECTORS_SPEC_RULE = {
  id: 'A10-R6-POLICY',
  addition_id: 'L0-A05',
  spec_section: 'M5',
  spec_line: 610,
  profile: 'sentropic.engram.memory-mutation/v1' as const,
  provider_id: 'sentropic.engram.memory' as const,
  provider_contract_version: '1.0.0' as const,
  connector_id: 'engram-memory' as const,
  vectors: {
    capture_v1: {
      preimage: {
        profile: 'sentropic.engram.memory-mutation/v1',
        reservation_ref: 'resv_01',
        provider_id: 'sentropic.engram.memory',
        provider_contract_version: '1.0.0',
        principal_namespace: 'ns:sent-tech.ca',
        principal_id: 'usr_alice',
        tenant_id: 'ten_01',
        store_id: 'store_local_01',
        connector_id: 'engram-memory',
        connector_instance_ref: 'conn_inst_01',
        scope_ref: 'scope:project:alpha',
        tool_name: 'engram_memory_capture',
        idempotency_key: 'idem_key_00000001',
        target: {
          kind: 'capture_source',
          source_ref: 'src_1',
          sequence: '1',
        },
        effective_input: {
          tool_name: 'engram_memory_capture',
          capture_policy_version: 'capture-policy/v1',
          payload: {
            schema_version: 2,
            scope_ref: 'scope:project:alpha',
            purpose_ref: 'purpose:engineering',
            valid_time: { t: 1792238400000 },
            components: [
              {
                component_id: 'comp_1',
                kind: 'decision',
                text: "Décision d'architecture: é",
                citation_ids: ['cit_1'],
              },
            ],
            primary_component_id: 'comp_1',
            primary_event: {
              at: 1792238400000,
              type_ref: 'evt:decision',
              citation_id: 'cit_1',
            },
            citations: [
              {
                citation_id: 'cit_1',
                source_ref: 'src_1',
                locator: {
                  scheme: 'engram',
                  value: 'session:1#step-1',
                },
                content_digest:
                  'sha256:1111111111111111111111111111111111111111111111111111111111111111',
                observed_at: '2026-10-17T12:00:00.000Z',
              },
            ],
            retention: {
              expires_at: '2026-11-16T12:00:00.000Z',
              derivative_rule: 'make-ineligible',
            },
            reconciliation: {
              family_refs: [],
            },
          },
          evidence: {
            evidence_ref: 'ev_1',
            evidence_digest:
              'sha256:1111111111111111111111111111111111111111111111111111111111111111',
            citation_ids: ['cit_1'],
          },
        },
      },
      expected_jcs_utf8:
        '{"connector_id":"engram-memory","connector_instance_ref":"conn_inst_01","effective_input":{"capture_policy_version":"capture-policy/v1","evidence":{"citation_ids":["cit_1"],"evidence_digest":"sha256:1111111111111111111111111111111111111111111111111111111111111111","evidence_ref":"ev_1"},"payload":{"citations":[{"citation_id":"cit_1","content_digest":"sha256:1111111111111111111111111111111111111111111111111111111111111111","locator":{"scheme":"engram","value":"session:1#step-1"},"observed_at":"2026-10-17T12:00:00.000Z","source_ref":"src_1"}],"components":[{"citation_ids":["cit_1"],"component_id":"comp_1","kind":"decision","text":"Décision d\'architecture: é"}],"primary_component_id":"comp_1","primary_event":{"at":1792238400000,"citation_id":"cit_1","type_ref":"evt:decision"},"purpose_ref":"purpose:engineering","reconciliation":{"family_refs":[]},"retention":{"derivative_rule":"make-ineligible","expires_at":"2026-11-16T12:00:00.000Z"},"schema_version":2,"scope_ref":"scope:project:alpha","valid_time":{"t":1792238400000}},"tool_name":"engram_memory_capture"},"idempotency_key":"idem_key_00000001","principal_id":"usr_alice","principal_namespace":"ns:sent-tech.ca","profile":"sentropic.engram.memory-mutation/v1","provider_contract_version":"1.0.0","provider_id":"sentropic.engram.memory","reservation_ref":"resv_01","scope_ref":"scope:project:alpha","store_id":"store_local_01","target":{"kind":"capture_source","sequence":"1","source_ref":"src_1"},"tenant_id":"ten_01","tool_name":"engram_memory_capture"}',
      expected_digest:
        'sha256:357fb3ed99bfb6a69c01b5fde5a1cd29873aa95b2d607d5097a1c0c2bf7e0262',
    },
    capture_v2: {
      expected_jcs_utf8:
        '{"connector_id":"engram-memory","connector_instance_ref":"conn_inst_01","effective_input":{"capture_policy_version":"capture-policy/v2","evidence":{"citation_ids":["cit_1"],"evidence_digest":"sha256:1111111111111111111111111111111111111111111111111111111111111111","evidence_ref":"ev_1"},"payload":{"citations":[{"citation_id":"cit_1","content_digest":"sha256:1111111111111111111111111111111111111111111111111111111111111111","locator":{"scheme":"engram","value":"session:1#step-1"},"observed_at":"2026-10-17T12:00:00.000Z","source_ref":"src_1"}],"components":[{"citation_ids":["cit_1"],"component_id":"comp_1","kind":"decision","text":"Décision d\'architecture: é"}],"primary_component_id":"comp_1","primary_event":{"at":1792238400000,"citation_id":"cit_1","type_ref":"evt:decision"},"purpose_ref":"purpose:engineering","reconciliation":{"family_refs":[]},"retention":{"derivative_rule":"make-ineligible","expires_at":"2026-11-16T12:00:00.000Z"},"schema_version":2,"scope_ref":"scope:project:alpha","valid_time":{"t":1792238400000}},"tool_name":"engram_memory_capture"},"idempotency_key":"idem_key_00000001","principal_id":"usr_alice","principal_namespace":"ns:sent-tech.ca","profile":"sentropic.engram.memory-mutation/v1","provider_contract_version":"1.0.0","provider_id":"sentropic.engram.memory","reservation_ref":"resv_01","scope_ref":"scope:project:alpha","store_id":"store_local_01","target":{"kind":"capture_source","sequence":"1","source_ref":"src_1"},"tenant_id":"ten_01","tool_name":"engram_memory_capture"}',
      expected_digest:
        'sha256:7c9173cec6db66a626a3e9e36e3b989d9977b426df4a8d5cc9a91f9d45596f27',
    },
    request_admission_v1: {
      preimage: {
        profile: 'sentropic.engram.memory-mutation/v1',
        reservation_ref: 'resv_02',
        provider_id: 'sentropic.engram.memory',
        provider_contract_version: '1.0.0',
        principal_namespace: 'ns:sent-tech.ca',
        principal_id: 'usr_alice',
        tenant_id: 'ten_01',
        store_id: 'store_local_01',
        connector_id: 'engram-memory',
        connector_instance_ref: 'conn_inst_01',
        scope_ref: 'scope:project:alpha',
        tool_name: 'engram_memory_request_admission',
        idempotency_key: 'idem_key_00000002',
        target: {
          kind: 'candidate',
          candidate_id: 'cand_01',
        },
        effective_input: {
          tool_name: 'engram_memory_request_admission',
          candidate_id: 'cand_01',
          admission_policy_version: 'admission-policy/v1',
        },
      },
      expected_jcs_utf8:
        '{"connector_id":"engram-memory","connector_instance_ref":"conn_inst_01","effective_input":{"admission_policy_version":"admission-policy/v1","candidate_id":"cand_01","tool_name":"engram_memory_request_admission"},"idempotency_key":"idem_key_00000002","principal_id":"usr_alice","principal_namespace":"ns:sent-tech.ca","profile":"sentropic.engram.memory-mutation/v1","provider_contract_version":"1.0.0","provider_id":"sentropic.engram.memory","reservation_ref":"resv_02","scope_ref":"scope:project:alpha","store_id":"store_local_01","target":{"candidate_id":"cand_01","kind":"candidate"},"tenant_id":"ten_01","tool_name":"engram_memory_request_admission"}',
      expected_digest:
        'sha256:5bab998f532b63aecd12f2d98b22667bd950e69ac67d08d08315a0aef157d037',
    },
    request_admission_v2: {
      expected_jcs_utf8:
        '{"connector_id":"engram-memory","connector_instance_ref":"conn_inst_01","effective_input":{"admission_policy_version":"admission-policy/v2","candidate_id":"cand_01","tool_name":"engram_memory_request_admission"},"idempotency_key":"idem_key_00000002","principal_id":"usr_alice","principal_namespace":"ns:sent-tech.ca","profile":"sentropic.engram.memory-mutation/v1","provider_contract_version":"1.0.0","provider_id":"sentropic.engram.memory","reservation_ref":"resv_02","scope_ref":"scope:project:alpha","store_id":"store_local_01","target":{"candidate_id":"cand_01","kind":"candidate"},"tenant_id":"ten_01","tool_name":"engram_memory_request_admission"}',
      expected_digest:
        'sha256:f5e70875468d0247b2db3108e237de9c50d436d34e0761fc0de52347abe55e5d',
    },
    withdraw_v1: {
      preimage: {
        profile: 'sentropic.engram.memory-mutation/v1',
        reservation_ref: 'resv_03',
        provider_id: 'sentropic.engram.memory',
        provider_contract_version: '1.0.0',
        principal_namespace: 'ns:sent-tech.ca',
        principal_id: 'usr_alice',
        tenant_id: 'ten_01',
        store_id: 'store_local_01',
        connector_id: 'engram-memory',
        connector_instance_ref: 'conn_inst_01',
        scope_ref: 'scope:project:alpha',
        tool_name: 'engram_memory_withdraw',
        idempotency_key: 'idem_key_00000003',
        target: {
          kind: 'candidate',
          candidate_id: 'cand_01',
        },
        effective_input: {
          tool_name: 'engram_memory_withdraw',
          candidate_id: 'cand_01',
          reason_ref: 'reason:duplicate-candidate',
          event_id: 'evt_wdr_01',
          event_anchor: {
            occurred_at: '2026-10-17T12:05:00.000Z',
            kind_ref: 'lifecycle:withdraw',
            provenance_ref: 'prov:withdraw:01',
            provenance_digest:
              'sha256:2222222222222222222222222222222222222222222222222222222222222222',
          },
        },
      },
      expected_jcs_utf8:
        '{"connector_id":"engram-memory","connector_instance_ref":"conn_inst_01","effective_input":{"candidate_id":"cand_01","event_anchor":{"kind_ref":"lifecycle:withdraw","occurred_at":"2026-10-17T12:05:00.000Z","provenance_digest":"sha256:2222222222222222222222222222222222222222222222222222222222222222","provenance_ref":"prov:withdraw:01"},"event_id":"evt_wdr_01","reason_ref":"reason:duplicate-candidate","tool_name":"engram_memory_withdraw"},"idempotency_key":"idem_key_00000003","principal_id":"usr_alice","principal_namespace":"ns:sent-tech.ca","profile":"sentropic.engram.memory-mutation/v1","provider_contract_version":"1.0.0","provider_id":"sentropic.engram.memory","reservation_ref":"resv_03","scope_ref":"scope:project:alpha","store_id":"store_local_01","target":{"candidate_id":"cand_01","kind":"candidate"},"tenant_id":"ten_01","tool_name":"engram_memory_withdraw"}',
      expected_digest:
        'sha256:e416f4a4c1e1c9bd5dc19eef6ed72233e050ef169d4b3d5af3c07136968bd78b',
    },
    // M:686,690: literal bytes transcribed independently of the production serializer.
    withdraw_changed_target: {
      expected_jcs_utf8:
        '{"connector_id":"engram-memory","connector_instance_ref":"conn_inst_01","effective_input":{"candidate_id":"cand_02","event_anchor":{"kind_ref":"lifecycle:withdraw","occurred_at":"2026-10-17T12:05:00.000Z","provenance_digest":"sha256:2222222222222222222222222222222222222222222222222222222222222222","provenance_ref":"prov:withdraw:01"},"event_id":"evt_wdr_01","reason_ref":"reason:duplicate-candidate","tool_name":"engram_memory_withdraw"},"idempotency_key":"idem_key_00000003","principal_id":"usr_alice","principal_namespace":"ns:sent-tech.ca","profile":"sentropic.engram.memory-mutation/v1","provider_contract_version":"1.0.0","provider_id":"sentropic.engram.memory","reservation_ref":"resv_03","scope_ref":"scope:project:alpha","store_id":"store_local_01","target":{"candidate_id":"cand_02","kind":"candidate"},"tenant_id":"ten_01","tool_name":"engram_memory_withdraw"}',
      expected_digest: 'sha256:3df1c2910332249fd977cdcc779d2d956a0f307e3b549adcecc02971702a6733',
    },
    withdraw_changed_effective_value: {
      expected_jcs_utf8:
        '{"connector_id":"engram-memory","connector_instance_ref":"conn_inst_01","effective_input":{"candidate_id":"cand_01","event_anchor":{"kind_ref":"lifecycle:withdraw","occurred_at":"2026-10-17T12:05:00.000Z","provenance_digest":"sha256:2222222222222222222222222222222222222222222222222222222222222222","provenance_ref":"prov:withdraw:01"},"event_id":"evt_wdr_01","reason_ref":"reason:operator-choice","tool_name":"engram_memory_withdraw"},"idempotency_key":"idem_key_00000003","principal_id":"usr_alice","principal_namespace":"ns:sent-tech.ca","profile":"sentropic.engram.memory-mutation/v1","provider_contract_version":"1.0.0","provider_id":"sentropic.engram.memory","reservation_ref":"resv_03","scope_ref":"scope:project:alpha","store_id":"store_local_01","target":{"candidate_id":"cand_01","kind":"candidate"},"tenant_id":"ten_01","tool_name":"engram_memory_withdraw"}',
      expected_digest: 'sha256:9d74c314c207fe80fc36c6b0c8da6feca6b9f0d0a91753b917d46621ac67caee',
    },
    forget_v1: {
      preimage: {
        profile: 'sentropic.engram.memory-mutation/v1',
        reservation_ref: 'resv_04',
        provider_id: 'sentropic.engram.memory',
        provider_contract_version: '1.0.0',
        principal_namespace: 'ns:sent-tech.ca',
        principal_id: 'usr_alice',
        tenant_id: 'ten_01',
        store_id: 'store_local_01',
        connector_id: 'engram-memory',
        connector_instance_ref: 'conn_inst_01',
        scope_ref: 'scope:project:alpha',
        tool_name: 'engram_memory_forget',
        idempotency_key: 'idem_key_00000004',
        target: {
          kind: 'record',
          record_id:
            'mem_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
        effective_input: {
          tool_name: 'engram_memory_forget',
          record_id:
            'mem_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          reason_ref: 'reason:user-erasure-request',
          event_id: 'evt_fgt_01',
          event_anchor: {
            occurred_at: '2026-10-17T12:10:00.000Z',
            kind_ref: 'lifecycle:tombstone',
            provenance_ref: 'prov:forget:01',
            provenance_digest:
              'sha256:3333333333333333333333333333333333333333333333333333333333333333',
          },
        },
      },
      expected_jcs_utf8:
        '{"connector_id":"engram-memory","connector_instance_ref":"conn_inst_01","effective_input":{"event_anchor":{"kind_ref":"lifecycle:tombstone","occurred_at":"2026-10-17T12:10:00.000Z","provenance_digest":"sha256:3333333333333333333333333333333333333333333333333333333333333333","provenance_ref":"prov:forget:01"},"event_id":"evt_fgt_01","reason_ref":"reason:user-erasure-request","record_id":"mem_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","tool_name":"engram_memory_forget"},"idempotency_key":"idem_key_00000004","principal_id":"usr_alice","principal_namespace":"ns:sent-tech.ca","profile":"sentropic.engram.memory-mutation/v1","provider_contract_version":"1.0.0","provider_id":"sentropic.engram.memory","reservation_ref":"resv_04","scope_ref":"scope:project:alpha","store_id":"store_local_01","target":{"kind":"record","record_id":"mem_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},"tenant_id":"ten_01","tool_name":"engram_memory_forget"}',
      expected_digest:
        'sha256:63a01349ee4a295d1a5a7747709318161a9116296cf7439802a1d363342283e7',
    },
  },
} as const;

export const A06_CONFIRMATION_CONTINUATION_SPEC_RULE = {
  id: 'L0-A06',
  spec_section: 'M4',
  spec_line: 1611,
  enrolled_oidc_domain: 'sent-tech.ca',
  hardware_key_required: false,
  max_ttl_seconds: 300,
  max_execution_seconds_after_confirmation: 30,
  require_now_strictly_before_expires_at: true,
  elicitation_mode: 'confirm',
  request_required_fields: ['capability', 'target_ref', 'operation_digest'] as const,
  response_required_fields: ['approved'] as const,
} as const;

export const A07_SELECTION_AND_STORAGE_SPEC_RULE = {
  id: 'L0-A07',
  spec_section: 'M7',
  spec_line: 1612,
  pipeline_phases: ['register', 'select', 'configure', 'compile'] as const,
  local_mesh_namespace: '/memory',
  disabled_namespace_helper: 'disabledNamespaceModule',
  sentropic_concrete_backend_status: 'unverified',
  h2a_concrete_backend: 'embedded-local-linux-sqlite',
  catalog_cache_key_fields: [
    'tenant_id',
    'principal_id',
    'agent_id',
    'policy_epoch',
    'provider_id',
    'provider_version',
    'source_id',
    'plan_generation',
  ] as const,
} as const;

export const A08_RELEASE_AND_MIGRATION_SPEC_RULE = {
  id: 'L0-A08',
  spec_section: 'M13/M14',
  spec_line: 1613,
  m14_spec_line: 1675,
  owner_selected_option: 'B' as const,
  option_a_pursued: false as const,
  option_b_0_20_0_lots: ['MCP-L0', 'MCP-L1', 'MCP-L2', 'MCP-L3'] as const,
  option_b_0_20_0_includes_l4_adapter: false as const,
  option_b_0_20_0_reference_durable_host_ports: [
    'reservation',
    'audit_sink',
    'policy_version_store',
  ] as const,
  option_b_later_adapter_release_order: [
    'L4_candidate',
    'L5_qualification_SqliteMemoryWorkflowStoreV1',
    'L5-MEMORY-V1',
    'L4_exit',
  ] as const,
  option_b_later_adapter_version_status: 'unverified' as const,
  l7_mesh_incompatible_removal_requires_even_0_x_major: true as const,
  l8_h2a_retired_files_count: 8 as const,
  h2a_planning_targets_do_not_preassign_memory_train: [
    '0.98.7',
    '0.98.8',
  ] as const,
} as const;

export const A09_CANDIDATE_AND_WRITER_HANDOFF_SPEC_RULE = {
  id: 'L0-A09',
  spec_section: 'M11/M12/M13',
  spec_line: 1614,
  l5_checkpoint_id: 'L5-MEMORY-V1',
  l5_reference_workflow_store: 'SqliteMemoryWorkflowStoreV1',
  l5_reference_subpath: '@sentropic/mcp-broker/memory-reference',
  writer_order: [
    '#679',
    'gateway-PR1-#685',
    'R2',
    'R7a',
    'R3',
    'MCP-L5',
    'MCP-L6',
    'MCP-L7',
  ] as const,
  gwrc_ci_contract_id: 'GWRC-CI-V1',
  program_memory_admitted_without_cofreeze: false as const,
  feedback_loop_items: ['SM-01', 'SM-02', 'SM-03'] as const,
} as const;
