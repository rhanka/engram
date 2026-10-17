import { describe, expect, it } from 'vitest';
import {
  ADDITIONAL_PUBLIC_MEMORY_ERROR_CODES,
  CLUSTER_MESH_MEMORY_INHERITANCE_CONTRACT_V1,
  D10_CODE_GRAPH_SEPARATION_CONTRACT_V1,
  DESTRUCTIVE_CONFIRMATION_POLICY,
  ENGRAM_MEMORY_CAPABILITY_GATES,
  ENGRAM_MEMORY_PROVIDER_MANIFEST,
  ENGRAM_MEMORY_REFERENCE_TOPOLOGY_V1,
  ENGRAM_MEMORY_RELEASE_CADENCE_V1,
  ENGRAM_MEMORY_SCHEMA_VERSION,
  ENGRAM_MEMORY_TOOL_DESCRIPTORS,
  ENGRAM_MEMORY_TOOL_NAMES,
  ENGRAM_MEMORY_TOOL_SCHEMAS,
  EXCLUDED_INTERNAL_MEMORY_OPERATIONS,
  LEGACY_MIGRATION_DISPOSITIONS_V1,
  MEMORY_ERROR_MAPPING_TABLE,
  MEMORY_MCP_LIMITS,
  NEUTRAL_MEMORY_ERROR_CODES,
  NO_CONFIRMATION_POLICY,
  OPUS_REVIEW_AMENDMENT_DISPOSITIONS_V1,
  PACKAGE_BOUNDARY_AND_CLI_CONTRACT_V1,
  PUBLIC_MEMORY_ERROR_CODES,
  SENTROPIC_MEMORY_CATALOG_ENTRIES,
  UNVERIFIED_CROSS_TEAM_ITEMS_V1,
  createHostLifecycleEventAnchorV1,
  evaluateClusterMeshMemoryInheritanceV1,
  evaluateIdempotentMutationStateV1,
  evaluateToolGateRequirements,
  mapNeutralMemoryErrorToPublic,
  mapUnexpectedDependencyExceptionToPublic,
  resolveCaptureReconciliationHookV1,
  resolveCaptureRetentionPolicyV1,
  validateCaptureInputV1,
  validateCaptureOutputV1,
  validateCaptureProvenancePrincipalBindingV1,
  validateForgetInputV1,
  validateForgetOutputV1,
  validateGetInputV1,
  validateGetOutputV1,
  validateMcpToolCallResponseV1,
  validatePaginationCursorBindingV1,
  validateRedactedMemoryRecordV2,
  validateRequestAdmissionInputV1,
  validateRequestAdmissionOutputV1,
  validateSearchInputV1,
  validateSearchOutputV1,
  validateToolInputV1,
  validateToolResultV1,
  validateTrustedInvocationContextV1,
  validateWithdrawInputV1,
  validateWithdrawOutputV1,
  verifyDestructiveConfirmationGrantV1,
  verifyRequiredNeutralReadFacets,
  type CaptureInputV1,
  type CaptureOutputV1,
  type DestructiveConfirmationGrantV1,
  type ForgetOutputV1,
  type GetOutputV1,
  type PaginationCursorBindingV1,
  type PrincipalRefV1,
  type PublicMemoryErrorCode,
  type RedactedMemoryRecordV2,
  type RequestAdmissionOutputV1,
  type ScopeRefV1,
  type SearchOutputV1,
  type TrustedInvocationContextV1,
  type WithdrawOutputV1,
} from '../src/mcp/memory/index.js';

const DIGEST_A = `sha256:${'a'.repeat(64)}`;
const DIGEST_B = `sha256:${'b'.repeat(64)}`;
const NOW_UTC = '2026-10-17T12:00:00.000Z';

const SAMPLE_SCOPE: ScopeRefV1 = {
  schema_version: ENGRAM_MEMORY_SCHEMA_VERSION,
  tenant_id: 'tenant-1',
  workspace_id: 'ws-1',
  project_id: 'proj-1',
  level: 'project',
  session_id: 'sess-1',
};

const SAMPLE_PRINCIPAL: PrincipalRefV1 = {
  schema_version: ENGRAM_MEMORY_SCHEMA_VERSION,
  principal_id: 'agent-1',
  principal_kind: 'agent',
  tenant_id: 'tenant-1',
  roles: ['memory.reader', 'memory.writer'],
};

const SAMPLE_CITATION = {
  schema_version: ENGRAM_MEMORY_SCHEMA_VERSION,
  citation_id: 'cit-1',
  locator: 'file:///repo/README.md',
  digest: DIGEST_A,
  media_type: 'text/markdown' as const,
  observed_at_utc: NOW_UTC,
  byte_range: { start_byte: 0, end_byte_exclusive: 120 },
  line_range: { start_line: 1, end_line_inclusive: 5 },
  excerpt: 'Use strict closed schemas for all MCP tools.',
};

const SAMPLE_REDACTED_RECORD_V2: RedactedMemoryRecordV2 = {
  schema_version: ENGRAM_MEMORY_SCHEMA_VERSION,
  memory_id: 'mem-1',
  scope_ref: SAMPLE_SCOPE,
  memory_kind: 'constraint',
  status: 'admitted',
  summary: 'All MCP tool schemas must be closed.',
  statement: 'Every MCP tool input and output JSON Schema sets additionalProperties: false.',
  structured_attributes: {
    lot: 'MCP-L0',
    enforced: true,
    priority: 1,
    notes: null,
  },
  content_digest: DIGEST_A,
  sensitivity: 'internal',
  source_class: 'verified-artifact',
  citations: [SAMPLE_CITATION],
  redaction_state: 'unredacted',
  redacted_fields: [],
  admitted_at_utc: NOW_UTC,
  supersedes_ids: [],
  active_dispute_ids: [],
};

describe('MCP-L0 Contract Freeze — Tool Schemas & Input Validation', () => {
  it('exposes the exact 6 tool names and closed JSON Schemas', () => {
    expect(ENGRAM_MEMORY_TOOL_NAMES).toEqual([
      'engram_memory_search',
      'engram_memory_get',
      'engram_memory_capture',
      'engram_memory_request_admission',
      'engram_memory_withdraw',
      'engram_memory_forget',
    ]);

    for (const name of ENGRAM_MEMORY_TOOL_NAMES) {
      const entry = ENGRAM_MEMORY_TOOL_SCHEMAS[name];
      expect(entry.name).toBe(name);
      expect(entry.inputSchema.additionalProperties).toBe(false);
      expect(Array.isArray(entry.outputSchema.oneOf)).toBe(true);
      expect(entry.outputSchema.oneOf).toHaveLength(2);
    }
  });

  it('validates engram_memory_search valid and invalid inputs', () => {
    expect(validateSearchInputV1({ query_text: 'memory contract' }).ok).toBe(
      true,
    );
    expect(
      validateSearchInputV1({
        query_text: 'memory contract',
        memory_kinds: ['fact', 'constraint'],
        status_filter: 'admitted-and-disputed',
        limit: 25,
        cursor: 'cursor-token-1',
      }).ok,
    ).toBe(true);

    // Invalid: empty query_text, >2048 UTF-8 bytes, duplicate memory_kinds, limit out of range, injected scope_ref, null optional field
    expect(validateSearchInputV1({ query_text: '' }).ok).toBe(false);
    expect(
      validateSearchInputV1({ query_text: 'é'.repeat(1025) }).ok,
    ).toBe(false);
    expect(
      validateSearchInputV1({
        query_text: 'valid',
        memory_kinds: ['fact', 'fact'],
      }).ok,
    ).toBe(false);
    expect(
      validateSearchInputV1({ query_text: 'valid', limit: 0 }).ok,
    ).toBe(false);
    expect(
      validateSearchInputV1({ query_text: 'valid', limit: 26 }).ok,
    ).toBe(false);
    expect(
      validateSearchInputV1({
        query_text: 'valid',
        scope_ref: SAMPLE_SCOPE,
      }).ok,
    ).toBe(false);
    expect(
      validateSearchInputV1({
        query_text: 'valid',
        cursor: null,
      }).ok,
    ).toBe(false);
  });

  it('validates engram_memory_get valid and invalid inputs', () => {
    expect(
      validateGetInputV1({ memory_ids: ['mem-1', 'mem-2'] }).ok,
    ).toBe(true);

    expect(validateGetInputV1({ memory_ids: [] }).ok).toBe(false);
    expect(
      validateGetInputV1({
        memory_ids: Array.from({ length: 11 }, (_, i) => `mem-${i}`),
      }).ok,
    ).toBe(false);
    expect(
      validateGetInputV1({ memory_ids: ['mem-1', 'mem-1'] }).ok,
    ).toBe(false);
    expect(
      validateGetInputV1({
        memory_ids: ['mem-1'],
        scope_ref: SAMPLE_SCOPE,
      }).ok,
    ).toBe(false);
  });

  it('validates engram_memory_capture valid and invalid inputs', () => {
    const validCapture: CaptureInputV1 = {
      idempotency_key: 'idem-cap-1',
      memory_kind: 'fact',
      payload: {
        summary: 'Short summary',
        statement: 'Detailed factual statement grounded in citation.',
        structured_attributes: {
          component: 'mcp',
          count: 3,
          verified: true,
          optional_note: null,
        },
      },
      provenance: {
        schema_version: ENGRAM_MEMORY_SCHEMA_VERSION,
        source_class: 'verified-artifact',
        captured_by: SAMPLE_PRINCIPAL,
        observed_at_utc: NOW_UTC,
        citations: [SAMPLE_CITATION],
      },
      sensitivity: 'internal',
      sharing_policy: 'local-only',
      retention_hint: {
        expires_at_utc: '2026-12-01T00:00:00.000Z',
        expiry_outcome: 'make-ineligible',
      },
      reconciliation_hint: {
        family_refs: ['fam-1', 'fam-2'],
      },
    };

    expect(validateCaptureInputV1(validCapture).ok).toBe(true);

    // Rejects injected host-owned fields (scope_ref, event_anchor, policy_id, legal_hold, strategy, conflict_key, D11 leg fields)
    expect(
      validateCaptureInputV1({
        ...validCapture,
        scope_ref: SAMPLE_SCOPE,
      }).ok,
    ).toBe(false);
    expect(
      validateCaptureInputV1({
        ...validCapture,
        event_anchor: {},
      }).ok,
    ).toBe(false);
    expect(
      validateCaptureInputV1({
        ...validCapture,
        retention_hint: {
          ...validCapture.retention_hint,
          legal_hold: true,
        },
      }).ok,
    ).toBe(false);
    expect(
      validateCaptureInputV1({
        ...validCapture,
        reconciliation_hint: {
          family_refs: ['fam-1'],
          strategy: 'supersede-by-key',
        },
      }).ok,
    ).toBe(false);
    expect(
      validateCaptureInputV1({
        ...validCapture,
        leg1_verdict_ref: 'v1',
      }).ok,
    ).toBe(false);

    // Rejects invalid digest, timestamp, schema_version, and UTF-8 byte limits
    const badDigestRes = validateCaptureInputV1({
      ...validCapture,
      provenance: {
        ...validCapture.provenance,
        citations: [{ ...SAMPLE_CITATION, digest: 'sha256:not-a-digest' }],
      },
    });
    expect(badDigestRes.ok).toBe(false);
    if (!badDigestRes.ok) {
      expect(badDigestRes.code).toBe('INVALID_DIGEST');
    }

    const badTsRes = validateCaptureInputV1({
      ...validCapture,
      provenance: {
        ...validCapture.provenance,
        observed_at_utc: '2026-02-30T12:00:00Z',
      },
    });
    expect(badTsRes.ok).toBe(false);
    if (!badTsRes.ok) {
      expect(badTsRes.code).toBe('INVALID_TIMESTAMP');
    }

    const badVerRes = validateCaptureInputV1({
      ...validCapture,
      provenance: {
        ...validCapture.provenance,
        schema_version: 'engram.memory/v99' as typeof ENGRAM_MEMORY_SCHEMA_VERSION,
      },
    });
    expect(badVerRes.ok).toBe(false);
    if (!badVerRes.ok) {
      expect(badVerRes.code).toBe('UNSUPPORTED_SCHEMA_VERSION');
    }

    // Multi-byte summary exceeding 512 UTF-8 bytes while <= 512 UTF-16 code units
    expect(
      validateCaptureInputV1({
        ...validCapture,
        payload: {
          ...validCapture.payload,
          summary: 'é'.repeat(300),
        },
      }).ok,
    ).toBe(false);
  });

  it('validates request_admission, withdraw, and forget inputs and rejects confirmed boolean injection', () => {
    expect(
      validateRequestAdmissionInputV1({
        idempotency_key: 'idem-adm-1',
        memory_id: 'mem-1',
        rationale_code: 'corroborated_by_artifact',
      }).ok,
    ).toBe(true);

    expect(
      validateWithdrawInputV1({
        idempotency_key: 'idem-wd-1',
        memory_id: 'mem-1',
        reason_code: 'user_retracted',
      }).ok,
    ).toBe(true);

    expect(
      validateForgetInputV1({
        idempotency_key: 'idem-fg-1',
        memory_id: 'mem-1',
        reason_code: 'privacy_erasure',
      }).ok,
    ).toBe(true);

    // Reject `confirmed: true` in input JSON for withdraw and forget (A-05)
    expect(
      validateWithdrawInputV1({
        idempotency_key: 'idem-wd-1',
        memory_id: 'mem-1',
        reason_code: 'user_retracted',
        confirmed: true,
      }).ok,
    ).toBe(false);

    expect(
      validateForgetInputV1({
        idempotency_key: 'idem-fg-1',
        memory_id: 'mem-1',
        reason_code: 'privacy_erasure',
        confirmed: true,
      }).ok,
    ).toBe(false);

    expect(
      validateToolInputV1('engram_memory_request_admission', {
        idempotency_key: 'idem-adm-1',
        memory_id: 'mem-1',
        rationale_code: 'corroborated',
        review_status: 'approved',
      }).ok,
    ).toBe(false);
  });
});

describe('MCP-L0 Contract Freeze — Output Schemas, V3 Recall, V1 Read & Transport Equivalence', () => {
  it('validates RedactedMemoryRecordV2 and enforces withheld redaction invariants', () => {
    expect(validateRedactedMemoryRecordV2(SAMPLE_REDACTED_RECORD_V2).ok).toBe(
      true,
    );

    const validWithheld: RedactedMemoryRecordV2 = {
      ...SAMPLE_REDACTED_RECORD_V2,
      statement: undefined,
      structured_attributes: undefined,
      redaction_state: 'withheld',
      redacted_fields: ['statement', 'structured_attributes', 'citations.excerpt'],
      citations: [
        {
          schema_version: ENGRAM_MEMORY_SCHEMA_VERSION,
          citation_id: 'cit-1',
          locator: 'file:///repo/README.md',
          digest: DIGEST_A,
          media_type: 'text/markdown',
          observed_at_utc: NOW_UTC,
        },
      ],
    };
    // Remove undefined keys to match omitted-optional contract
    delete (validWithheld as Record<string, unknown>).statement;
    delete (validWithheld as Record<string, unknown>).structured_attributes;
    expect(validateRedactedMemoryRecordV2(validWithheld).ok).toBe(true);

    // Withheld record leaking statement or citation excerpt must fail
    expect(
      validateRedactedMemoryRecordV2({
        ...validWithheld,
        statement: 'leaked statement',
      }).ok,
    ).toBe(false);
    expect(
      validateRedactedMemoryRecordV2({
        ...validWithheld,
        citations: [SAMPLE_CITATION],
      }).ok,
    ).toBe(false);
  });

  it('validates all 6 tool output payloads and dual-channel MCP responses', () => {
    const searchOut: SearchOutputV1 = {
      schema_version: ENGRAM_MEMORY_SCHEMA_VERSION,
      packet_id: 'pkt-1',
      query_id: 'qry-1',
      scope_ref: SAMPLE_SCOPE,
      status_filter: 'admitted-only',
      ordering: {
        primary: 'relevance_score_bps_desc',
        secondary: 'admitted_at_utc_desc',
        tertiary: 'memory_id_asc',
      },
      generated_at_utc: NOW_UTC,
      records: [
        {
          rank: 1,
          relevance_score_bps: 9500,
          record: SAMPLE_REDACTED_RECORD_V2,
        },
      ],
      withheld_count: 0,
      page: {
        returned_count: 1,
        has_more: false,
      },
    };
    expect(validateSearchOutputV1(searchOut).ok).toBe(true);
    expect(
      validateSearchOutputV1({
        ...searchOut,
        page: { returned_count: 2, has_more: false },
      }).ok,
    ).toBe(false);

    const getOut: GetOutputV1 = {
      schema_version: ENGRAM_MEMORY_SCHEMA_VERSION,
      packet_id: 'read-pkt-1',
      scope_ref: SAMPLE_SCOPE,
      generated_at_utc: NOW_UTC,
      results: [
        {
          memory_id: 'mem-1',
          outcome: 'returned',
          status: 'admitted',
          record: SAMPLE_REDACTED_RECORD_V2,
          reason_codes: [],
        },
        {
          memory_id: 'mem-2',
          outcome: 'not_found',
          reason_codes: ['not_found_or_unauthorized'],
        },
      ],
    };
    expect(validateGetOutputV1(getOut).ok).toBe(true);
    // not_found must not expose status
    expect(
      validateGetOutputV1({
        ...getOut,
        results: [
          {
            memory_id: 'mem-2',
            outcome: 'not_found',
            status: 'candidate',
            reason_codes: [],
          },
        ],
      }).ok,
    ).toBe(false);

    const captureOut: CaptureOutputV1 = {
      schema_version: ENGRAM_MEMORY_SCHEMA_VERSION,
      memory_id: 'mem-1',
      status: 'candidate',
      content_digest: DIGEST_A,
      captured_at_utc: NOW_UTC,
      event_id: 'ev-1',
      idempotent_replay: false,
    };
    expect(validateCaptureOutputV1(captureOut).ok).toBe(true);

    const admOut: RequestAdmissionOutputV1 = {
      schema_version: ENGRAM_MEMORY_SCHEMA_VERSION,
      memory_id: 'mem-1',
      outcome: 'admitted',
      resulting_status: 'admitted',
      decided_at_utc: NOW_UTC,
      assessment: {
        schema_version: ENGRAM_MEMORY_SCHEMA_VERSION,
        policy_id: 'pol-1',
        policy_version: '1.0.0',
        admissible: true,
        confidence_bps: 9200,
        assessed_at_utc: NOW_UTC,
        assessed_by: SAMPLE_PRINCIPAL,
        reason_codes: ['corroborated'],
        required_corroboration_count: 1,
        observed_corroboration_count: 1,
      },
      idempotent_replay: false,
      event_id: 'ev-2',
    };
    expect(validateRequestAdmissionOutputV1(admOut).ok).toBe(true);

    const wdOut: WithdrawOutputV1 = {
      schema_version: ENGRAM_MEMORY_SCHEMA_VERSION,
      memory_id: 'mem-1',
      previous_status: 'admitted',
      status: 'withdrawn',
      withdrawn_at_utc: NOW_UTC,
      event_id: 'ev-3',
      idempotent_replay: false,
    };
    expect(validateWithdrawOutputV1(wdOut).ok).toBe(true);

    const fgOut: ForgetOutputV1 = {
      schema_version: ENGRAM_MEMORY_SCHEMA_VERSION,
      memory_id: 'mem-1',
      tombstone_id: 'tomb-1',
      erased_at_utc: NOW_UTC,
      event_id: 'ev-4',
      erased_artifact_digests: [DIGEST_A, DIGEST_B],
      destroyed_key_ids: ['key-1'],
      idempotent_replay: false,
    };
    expect(validateForgetOutputV1(fgOut).ok).toBe(true);

    const envelope = {
      ok: true as const,
      schema_version: ENGRAM_MEMORY_SCHEMA_VERSION,
      tool: 'engram_memory_capture' as const,
      result: captureOut,
    };
    expect(validateToolResultV1('engram_memory_capture', envelope).ok).toBe(
      true,
    );

    const mcpResp = {
      isError: false,
      structuredContent: envelope,
      content: [{ type: 'text' as const, text: JSON.stringify(envelope) }],
    };
    expect(
      validateMcpToolCallResponseV1('engram_memory_capture', mcpResp).ok,
    ).toBe(true);

    // Mismatched isError or mismatched text payload must fail
    expect(
      validateMcpToolCallResponseV1('engram_memory_capture', {
        ...mcpResp,
        isError: true,
      }).ok,
    ).toBe(false);
    expect(
      validateMcpToolCallResponseV1('engram_memory_capture', {
        ...mcpResp,
        content: [{ type: 'text', text: '{"ok":false}' }],
      }).ok,
    ).toBe(false);

    // Oversized > 64 KiB response fails with RESULT_TOO_LARGE
    const hugeResp = {
      isError: false,
      structuredContent: envelope,
      content: [{ type: 'text' as const, text: 'x'.repeat(66000) }],
    };
    const hugeCheck = validateMcpToolCallResponseV1(
      'engram_memory_capture',
      hugeResp,
    );
    expect(hugeCheck.ok).toBe(false);
    if (!hugeCheck.ok) {
      expect(hugeCheck.code).toBe('RESULT_TOO_LARGE');
    }
  });

  it('verifies required neutral read facets (recallV3 and readV1)', () => {
    expect(verifyRequiredNeutralReadFacets({})).toEqual({
      ok: false,
      missing_facets: ['recallV3', 'readV1'],
    });
    expect(
      verifyRequiredNeutralReadFacets({
        recallV3: async () => ({}),
        readV1: async () => ({}),
      }),
    ).toEqual({
      ok: true,
      missing_facets: [],
    });
  });
});

describe('MCP-L0 Contract Freeze — Total Error Mapping Table & Disclosure Protection', () => {
  it('is total over all 27 neutral MemoryErrorCode values plus 4 public MCP/broker codes', () => {
    expect(NEUTRAL_MEMORY_ERROR_CODES).toHaveLength(27);
    expect(ADDITIONAL_PUBLIC_MEMORY_ERROR_CODES).toHaveLength(4);
    expect(PUBLIC_MEMORY_ERROR_CODES).toHaveLength(31);

    for (const code of [
      ...NEUTRAL_MEMORY_ERROR_CODES,
      ...ADDITIONAL_PUBLIC_MEMORY_ERROR_CODES,
    ]) {
      const spec = MEMORY_ERROR_MAPPING_TABLE[code];
      expect(spec).toBeDefined();
      expect(spec.source_code).toBe(code);
      expect(spec.public_code).toBe(code);
      expect(spec.is_error).toBe(true);

      const mapped = mapNeutralMemoryErrorToPublic({
        tool: 'engram_memory_search',
        code,
        targetAuthorized: true,
      });
      expect(mapped.isError).toBe(true);
      expect(mapped.structuredContent.ok).toBe(false);
      if (!mapped.structuredContent.ok) {
        expect(mapped.structuredContent.error.code).toBe(code);
        expect(mapped.structuredContent.error.retryable).toBe(spec.retryable);
      }
      expect(
        validateMcpToolCallResponseV1('engram_memory_search', mapped).ok,
      ).toBe(true);
    }
  });

  it('normalizes target-existence/state errors to NOT_FOUND before target authorization on mutation tools', () => {
    const leakCodes: PublicMemoryErrorCode[] = [
      'ILLEGAL_TRANSITION',
      'ALREADY_TERMINAL',
      'LEGAL_HOLD_ACTIVE',
      'SCOPE_VIOLATION',
      'UNAUTHORIZED_PRINCIPAL',
    ];

    for (const code of leakCodes) {
      const unauthorizedResp = mapNeutralMemoryErrorToPublic({
        tool: 'engram_memory_forget',
        code,
        targetAuthorized: false,
        details: { current_status: 'quarantined' },
      });
      expect(unauthorizedResp.structuredContent.ok).toBe(false);
      if (!unauthorizedResp.structuredContent.ok) {
        expect(unauthorizedResp.structuredContent.error.code).toBe('NOT_FOUND');
        expect(unauthorizedResp.structuredContent.error.details).toBeUndefined();
      }

      const authorizedResp = mapNeutralMemoryErrorToPublic({
        tool: 'engram_memory_forget',
        code,
        targetAuthorized: true,
        details: { current_status: 'tombstoned' },
      });
      expect(authorizedResp.structuredContent.ok).toBe(false);
      if (!authorizedResp.structuredContent.ok) {
        expect(authorizedResp.structuredContent.error.code).toBe(code);
      }
    }
  });

  it('sanitizes paths, SQL fragments, and stack traces and maps unexpected exceptions by commit phase', () => {
    const leakedPath = mapNeutralMemoryErrorToPublic({
      tool: 'engram_memory_get',
      code: 'STORAGE_IO_ERROR',
      message: 'SQLITE_CANTOPEN: /home/antoinefa/secret/db.sqlite failed',
    });
    if (!leakedPath.structuredContent.ok) {
      expect(leakedPath.structuredContent.error.message).not.toContain(
        '/home/',
      );
    }

    const preCommit = mapUnexpectedDependencyExceptionToPublic({
      tool: 'engram_memory_capture',
      commitPhaseEntered: false,
      classification: 'storage_io',
    });
    if (!preCommit.structuredContent.ok) {
      expect(preCommit.structuredContent.error.code).toBe('STORAGE_IO_ERROR');
      expect(preCommit.structuredContent.error.retryable).toBe(true);
    }

    const postCommit = mapUnexpectedDependencyExceptionToPublic({
      tool: 'engram_memory_capture',
      commitPhaseEntered: true,
      classification: 'timeout',
    });
    if (!postCommit.structuredContent.ok) {
      expect(postCommit.structuredContent.error.code).toBe(
        'MUTATION_OUTCOME_UNKNOWN',
      );
      expect(postCommit.structuredContent.error.retryable).toBe(true);
    }
  });
});

describe('MCP-L0 Contract Freeze — Gates, Manifest, Host Policy, Confirmation, Pagination & Topology', () => {
  it('freezes the provider manifest, Sentropic catalog descriptors, and excluded substrate operations', () => {
    expect(ENGRAM_MEMORY_PROVIDER_MANIFEST.appId).toBe('engram-memory');
    expect(ENGRAM_MEMORY_PROVIDER_MANIFEST.defaultEnabled).toBe(false);
    expect(ENGRAM_MEMORY_PROVIDER_MANIFEST.tools).toHaveLength(6);
    expect(SENTROPIC_MEMORY_CATALOG_ENTRIES).toHaveLength(6);

    for (const entry of SENTROPIC_MEMORY_CATALOG_ENTRIES) {
      expect(entry.clusterMeshModule).toBe('/memory');
      expect(entry.voluntaryInheritanceOnly).toBe(true);
      expect(entry.defaultEnabled).toBe(false);
      expect(entry.externalMutation).toBe(false);
      expect(entry.idempotent).toBe(true);
    }

    expect(
      ENGRAM_MEMORY_CAPABILITY_GATES.engram_memory_withdraw
        .requiresUserConfirmation,
    ).toBe(true);
    expect(
      ENGRAM_MEMORY_CAPABILITY_GATES.engram_memory_forget
        .requiresUserConfirmation,
    ).toBe(true);
    expect(DESTRUCTIVE_CONFIRMATION_POLICY.allow_input_boolean_bypass).toBe(
      false,
    );
    expect(NO_CONFIRMATION_POLICY.required).toBe(false);
    expect(EXCLUDED_INTERNAL_MEMORY_OPERATIONS).toHaveLength(20);

    const gateFail = evaluateToolGateRequirements('engram_memory_forget', {
      hasTrustedScope: true,
      hasTrustedPrincipal: true,
      hasCapabilityToken: true,
      hasPolicyVerdict: true,
      hasVerifiedEvidence: false,
      hasUserConfirmation: false,
      withinQuota: true,
      withinRateLimit: true,
    });
    expect(gateFail).toEqual({
      allowed: false,
      failed_gate: 'requiresUserConfirmation',
      error_code: 'gate_failed',
    });
  });

  it('enforces trusted invocation context, provenance binding, retention ceiling, reconciliation consent subset, confirmation TTL, and idempotent replay', () => {
    const validCtx: TrustedInvocationContextV1 = {
      scope_ref: SAMPLE_SCOPE,
      principal_ref: SAMPLE_PRINCIPAL,
      correlation_id: 'corr-1',
      now_utc: NOW_UTC,
      deadline_ms: 5000,
      capability_token_id: 'cap-tok-1',
    };
    expect(validateTrustedInvocationContextV1(validCtx).ok).toBe(true);
    expect(
      validateTrustedInvocationContextV1({
        ...validCtx,
        deadline_ms: 30001,
      }).ok,
    ).toBe(false);

    const anchor = createHostLifecycleEventAnchorV1({
      tool: 'engram_memory_capture',
      event_anchor_id: 'anch-1',
      context: validCtx,
    });
    expect(anchor.anchor_kind).toBe('capture');
    expect(anchor.actor).toEqual(SAMPLE_PRINCIPAL);

    expect(
      validateCaptureProvenancePrincipalBindingV1(
        {
          provenance: {
            schema_version: ENGRAM_MEMORY_SCHEMA_VERSION,
            source_class: 'verified-artifact',
            captured_by: { ...SAMPLE_PRINCIPAL, principal_id: 'spoofed-agent' },
            observed_at_utc: NOW_UTC,
            citations: [SAMPLE_CITATION],
          },
        },
        SAMPLE_PRINCIPAL,
      ),
    ).toEqual({
      ok: false,
      error_code: 'UNAUTHORIZED_PRINCIPAL',
      message:
        'provenance.captured_by must match the authenticated caller principal.',
    });

    // Retention policy: clamps 'retain' to 'make-ineligible' when allow_retain_outcome is false
    const retentionClamped = resolveCaptureRetentionPolicyV1({
      captured_at_utc: NOW_UTC,
      host_policy: {
        policy_id: 'ret-pol-1',
        default_retention_days: 30,
        max_retention_days: 90,
        default_expiry_outcome: 'make-ineligible',
        allow_retain_outcome: false,
      },
      retention_hint: {
        expires_at_utc: '2028-01-01T00:00:00.000Z',
        expiry_outcome: 'retain',
      },
    });
    expect(retentionClamped.ok).toBe(true);
    if (retentionClamped.ok) {
      expect(retentionClamped.value.expiry_outcome).toBe('make-ineligible');
      expect(retentionClamped.value.legal_hold).toBe(false);
      // Clamped to 90 days from 2026-10-17T12:00:00.000Z -> 2027-01-15T12:00:00.000Z
      expect(retentionClamped.value.retain_until_utc).toBe(
        '2027-01-15T12:00:00.000Z',
      );
    }

    // Reconciliation policy: rejects unconsented family_ref with CONSENT_DENIED
    const recDenied = resolveCaptureReconciliationHookV1({
      host_policy: {
        default_strategy: 'manual-only',
        consented_family_refs: ['fam-1'],
      },
      reconciliation_hint: {
        family_refs: ['fam-1', 'fam-unauthorized'],
      },
    });
    expect(recDenied).toEqual({
      ok: false,
      error_code: 'CONSENT_DENIED',
      message:
        "reconciliation_hint family_ref 'fam-unauthorized' is not authorized by active consent.",
    });

    // Destructive confirmation grant verification (300s TTL + exact parameter binding)
    const validGrant: DestructiveConfirmationGrantV1 = {
      confirmation_id: 'conf-1',
      tool_name: 'engram_memory_forget',
      scope_ref: SAMPLE_SCOPE,
      principal_id: 'agent-1',
      memory_id: 'mem-1',
      reason_code: 'privacy_erasure',
      target_digest_or_status: DIGEST_A,
      issued_at_utc: '2026-10-17T11:58:00.000Z',
      expires_at_utc: '2026-10-17T12:03:00.000Z',
    };
    expect(
      verifyDestructiveConfirmationGrantV1(validGrant, {
        tool_name: 'engram_memory_forget',
        scope_ref: SAMPLE_SCOPE,
        principal_id: 'agent-1',
        memory_id: 'mem-1',
        reason_code: 'privacy_erasure',
        target_digest_or_status: DIGEST_A,
        now_utc: NOW_UTC,
      }).ok,
    ).toBe(true);

    expect(
      verifyDestructiveConfirmationGrantV1(
        { ...validGrant, memory_id: 'mem-other' },
        {
          tool_name: 'engram_memory_forget',
          scope_ref: SAMPLE_SCOPE,
          principal_id: 'agent-1',
          memory_id: 'mem-1',
          reason_code: 'privacy_erasure',
          target_digest_or_status: DIGEST_A,
          now_utc: NOW_UTC,
        },
      ).ok,
    ).toBe(false);

    // Durable idempotent state transitions
    const opKey = {
      scope_ref: SAMPLE_SCOPE,
      principal_id: 'agent-1',
      tool_name: 'engram_memory_capture' as const,
      idempotency_key: 'idem-1',
    };
    expect(evaluateIdempotentMutationStateV1(undefined, DIGEST_A)).toEqual({
      decision: 'execute_new',
    });
    expect(
      evaluateIdempotentMutationStateV1(
        {
          key: opKey,
          request_digest: DIGEST_A,
          status: 'in_flight',
          created_at_utc: NOW_UTC,
        },
        DIGEST_A,
      ),
    ).toEqual({
      decision: 'reject',
      error_code: 'CONCURRENCY_CONFLICT',
      retryable: true,
    });
    expect(
      evaluateIdempotentMutationStateV1(
        {
          key: opKey,
          request_digest: DIGEST_A,
          status: 'completed',
          created_at_utc: NOW_UTC,
          stored_output: { event_id: 'ev-1', idempotent_replay: false },
        },
        DIGEST_B,
      ),
    ).toEqual({
      decision: 'reject',
      error_code: 'IDEMPOTENCY_CONFLICT',
      retryable: false,
    });
    expect(
      evaluateIdempotentMutationStateV1(
        {
          key: opKey,
          request_digest: DIGEST_A,
          status: 'completed',
          created_at_utc: NOW_UTC,
          stored_output: { event_id: 'ev-1', idempotent_replay: false },
        },
        DIGEST_A,
      ),
    ).toEqual({
      decision: 'replay_completed',
      output: { event_id: 'ev-1', idempotent_replay: true },
    });

    // Pagination cursor binding validation
    const cursorBinding: PaginationCursorBindingV1 = {
      scope_ref: SAMPLE_SCOPE,
      query_digest: DIGEST_A,
      status_filter: 'admitted-only',
      memory_kinds: ['fact', 'constraint'],
      ordering: {
        primary: 'relevance_score_bps_desc',
        secondary: 'admitted_at_utc_desc',
        tertiary: 'memory_id_asc',
      },
      snapshot_watermark: 'ev-100',
      issued_at_utc: '2026-10-17T11:59:00.000Z',
      expires_at_utc: '2026-10-17T12:04:00.000Z',
      offset: 10,
    };
    expect(
      validatePaginationCursorBindingV1(
        cursorBinding,
        {
          scope_ref: SAMPLE_SCOPE,
          query_digest: DIGEST_A,
          status_filter: 'admitted-only',
          memory_kinds: ['constraint', 'fact'],
          ordering: cursorBinding.ordering,
          snapshot_watermark: 'ev-100',
        },
        NOW_UTC,
      ).ok,
    ).toBe(true);
    expect(
      validatePaginationCursorBindingV1(
        cursorBinding,
        {
          scope_ref: SAMPLE_SCOPE,
          query_digest: DIGEST_B,
          status_filter: 'admitted-only',
          memory_kinds: ['constraint', 'fact'],
          ordering: cursorBinding.ordering,
          snapshot_watermark: 'ev-100',
        },
        NOW_UTC,
      ).ok,
    ).toBe(false);
  });

  it('freezes 0.20.0 topology, voluntary cluster-mesh inheritance, D10 separation, legacy retirement, and unverified cross-team items', () => {
    expect(ENGRAM_MEMORY_RELEASE_CADENCE_V1.engram_release_version).toBe(
      '0.20.0',
    );
    expect(ENGRAM_MEMORY_RELEASE_CADENCE_V1.tools_default_enabled).toBe(false);
    expect(
      ENGRAM_MEMORY_REFERENCE_TOPOLOGY_V1.cross_host_memory_calls_in_0_20_0,
    ).toBe(false);
    expect(
      ENGRAM_MEMORY_REFERENCE_TOPOLOGY_V1.wc_arch_06_blocks_embedded_local_0_20_0,
    ).toBe(false);
    expect(CLUSTER_MESH_MEMORY_INHERITANCE_CONTRACT_V1.subpath).toBe(
      '@sentropic/cluster-mesh/memory',
    );

    expect(
      evaluateClusterMeshMemoryInheritanceV1({
        host_config_persisted: true,
        host_memory_mcp_enabled: false,
        tenant_policy_persisted: true,
        tenant_memory_mcp_enabled: true,
        cluster_mesh_memory_module_available: true,
      }),
    ).toEqual({
      enabled: false,
      refusal_code: 'memory_mcp_disabled_by_default',
    });

    expect(
      evaluateClusterMeshMemoryInheritanceV1({
        host_config_persisted: true,
        host_memory_mcp_enabled: true,
        tenant_policy_persisted: true,
        tenant_memory_mcp_enabled: true,
        cluster_mesh_memory_module_available: false,
      }),
    ).toEqual({
      enabled: false,
      refusal_code: 'cluster_mesh_module_unavailable',
    });

    expect(
      evaluateClusterMeshMemoryInheritanceV1({
        host_config_persisted: true,
        host_memory_mcp_enabled: true,
        tenant_policy_persisted: true,
        tenant_memory_mcp_enabled: true,
        cluster_mesh_memory_module_available: true,
      }),
    ).toEqual({ enabled: true });

    expect(D10_CODE_GRAPH_SEPARATION_CONTRACT_V1.amended_on).toBe('2026-10-17');
    expect(D10_CODE_GRAPH_SEPARATION_CONTRACT_V1.graph_json_role).toBe(
      'code-graph-only',
    );
    expect(
      LEGACY_MIGRATION_DISPOSITIONS_V1.cluster_mesh_shadow_protocol_retired
        .retired_operations,
    ).toHaveLength(4);
    expect(
      LEGACY_MIGRATION_DISPOSITIONS_V1.h2a_legacy_memory_files_retired,
    ).toHaveLength(8);
    expect(
      PACKAGE_BOUNDARY_AND_CLI_CONTRACT_V1.default_engram_cli_excludes_memory_mcp_and_sqlite,
    ).toBe(true);
    expect(OPUS_REVIEW_AMENDMENT_DISPOSITIONS_V1).toHaveLength(16);
    expect(UNVERIFIED_CROSS_TEAM_ITEMS_V1).toHaveLength(7);
    expect(ENGRAM_MEMORY_TOOL_DESCRIPTORS).toHaveLength(6);
    expect(MEMORY_MCP_LIMITS.MAX_SERIALIZED_RESPONSE_UTF8_BYTES).toBe(65536);
  });
});
