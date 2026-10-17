import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  ADDITIONAL_PUBLIC_MEMORY_ERROR_CODES,
  CANDIDATE_PAYLOAD_V2_SCHEMA,
  CAPTURE_RESULT_PAYLOAD_SCHEMA,
  CLUSTER_MESH_MEMORY_INHERITANCE_CONTRACT_V1,
  CONFIRM_ELICITATION_REQUEST_SCHEMA,
  CONFIRM_ELICITATION_RESPONSE_SCHEMA,
  D10_CODE_GRAPH_SEPARATION_CONTRACT_V1,
  DEFAULT_RECALL_CAPABILITY_POLICY,
  DESTRUCTIVE_ELICITATION_CONFIRM_POLICY,
  DISCLOSABLE_MEMORY_STATES,
  ENGRAM_MEMORY_CANDIDATE_SCHEMA_VERSION,
  ENGRAM_MEMORY_CAPABILITY_GATES,
  ENGRAM_MEMORY_CAPTURE_INPUT_SCHEMA,
  ENGRAM_MEMORY_CAPTURE_OUTPUT_SCHEMA,
  ENGRAM_MEMORY_CAPTURE_PAYLOAD_INPUT_SCHEMA,
  ENGRAM_MEMORY_CONNECTOR_REGISTRATION,
  ENGRAM_MEMORY_FORGET_INPUT_SCHEMA,
  ENGRAM_MEMORY_FORGET_OUTPUT_SCHEMA,
  ENGRAM_MEMORY_GET_INPUT_SCHEMA,
  ENGRAM_MEMORY_GET_OUTPUT_SCHEMA,
  ENGRAM_MEMORY_MCP_CONTRACT_VERSION,
  ENGRAM_MEMORY_PROVIDER_MANIFEST,
  ENGRAM_MEMORY_REFERENCE_TOPOLOGY_V1,
  ENGRAM_MEMORY_RELEASE_CADENCE_V1,
  ENGRAM_MEMORY_REQUEST_ADMISSION_INPUT_SCHEMA,
  ENGRAM_MEMORY_REQUEST_ADMISSION_OUTPUT_SCHEMA,
  ENGRAM_MEMORY_SEARCH_INPUT_SCHEMA,
  ENGRAM_MEMORY_SEARCH_OUTPUT_SCHEMA,
  ENGRAM_MEMORY_STRUCTURED_OUTPUT_SCHEMA_VERSION,
  ENGRAM_MEMORY_TOOL_DESCRIPTORS,
  ENGRAM_MEMORY_TOOL_NAMES,
  ENGRAM_MEMORY_TOOL_NEUTRAL_BINDINGS,
  ENGRAM_MEMORY_TOOL_SCHEMAS,
  ENGRAM_MEMORY_WITHDRAW_INPUT_SCHEMA,
  ENGRAM_MEMORY_WITHDRAW_OUTPUT_SCHEMA,
  EXCLUDED_INTERNAL_MEMORY_OPERATIONS,
  FORGET_RESULT_PAYLOAD_SCHEMA,
  GET_RESULT_PAYLOAD_SCHEMA,
  LEGACY_MIGRATION_DISPOSITIONS_V1,
  MEMORY_ERROR_MAPPING_TABLE,
  MEMORY_MCP_LIMITS,
  MEMORY_READ_PACKET_V1_SCHEMA,
  MEMORY_READ_RECEIPT_V1_SCHEMA,
  NEUTRAL_MEMORY_ERROR_CODES,
  NON_DISCLOSABLE_MEMORY_STATES,
  OPUS_REVIEW_AMENDMENT_DISPOSITIONS_V1,
  PACKAGE_BOUNDARY_AND_CLI_CONTRACT_V1,
  PUBLIC_MEMORY_ERROR_CODES,
  RANK_RECEIPT_V1_SCHEMA,
  RECALL_PACKET_V3_SCHEMA,
  RECALL_RECORD_PACKET_V3_SCHEMA,
  REDACTED_MEMORY_RECORD_V2_JSON_SCHEMA,
  REDACTED_MEMORY_RECORD_V2_SCHEMA,
  REQUEST_ADMISSION_RESULT_PAYLOAD_SCHEMA,
  SEARCH_RESULT_PAYLOAD_SCHEMA,
  SENTROPIC_MEMORY_CATALOG_ENTRIES,
  TARGET_BEARING_MEMORY_TOOLS,
  TOMBSTONE_ALLOWED_FROM_STATES,
  UNVERIFIED_CROSS_TEAM_ITEMS_V1,
  WITHDRAW_RESULT_PAYLOAD_SCHEMA,
  createHostLifecycleEventAnchorV1,
  createToolSuccessEnvelope,
  evaluateClusterMeshMemoryInheritanceV1,
  evaluateIdempotentMutationStateV1,
  evaluateSameScopeTombstoneRecaptureGuardV1,
  evaluateToolGateRequirements,
  isDisclosableMemoryState,
  isValidCursor,
  isValidIdempotencyKey,
  isValidInstant,
  isValidOpaqueRef,
  isValidRecordId,
  isValidSha256Digest,
  isWellFormedUnicodeAndNfc,
  mapNeutralMemoryErrorToPublic,
  mapUnexpectedDependencyExceptionToPublic,
  resolveCaptureReconciliationConsentV1,
  resolveCaptureReconciliationHookV1,
  resolveCaptureRetentionPolicyV1,
  sanitizePublicErrorMessage,
   validateCaptureInputV1,
  validateCaptureOutputV1,
  validateCapturePayloadInputV1,
  validateForgetInputV1,
  validateForgetOutputV1,
  validateGetInputV1,
  validateGetOutputV1,
  validateMcpToolCallResponseV1,
  validateMemoryReadReceiptV1,
  validatePaginationCursorBindingV1,
  validatePaginationHandleStateV1,
  validateRankReceiptV1,
  validateRecallRecordPacketV3,
  validateRedactedMemoryRecordV2,
  validateRequestAdmissionInputV1,
  validateRequestAdmissionOutputV1,
  validateSearchInputV1,
  validateSearchOutputV1,
  validateToolInputByName,
  validateToolResultV1,
  validateTrustedInvocationContextV1,
  validateWithdrawInputV1,
  validateWithdrawOutputV1,
  verifyDestructiveConfirmationGrantV1,
  verifyRequiredNeutralReadFacets,
  type CaptureInputV1,
  type CaptureOutputV1,
  type DestructiveConfirmationGrantV1,
  type DurableOperationKeyV1,
  type DurableOperationRecordV1,
  type ForgetOutputV1,
  type MemoryErrorV1,
  type MemoryReadPacketV1,
  type PaginationContinuationContextV1,
  type PaginationHandleStateV1,
  type PublicMemoryErrorCode,
  type RequestAdmissionOutputV1,
  type SearchPageV1,
  type TrustedInvocationContextV1,
  type WithdrawOutputV1,
} from '../src/mcp/memory/index.js';

const ROOT = join(import.meta.dirname, '..');
const NEUTRAL_CONTRACTS_PATH = join(
  ROOT,
  'engram-memory',
  'contracts',
  'index.ts',
);
const SPEC_V2_PATH = join(ROOT, 'spec', 'SPEC_MEMORY_MCP_V2.md');

const DIGEST_A = `sha256:${'a'.repeat(64)}` as const;
const DIGEST_B = `sha256:${'b'.repeat(64)}` as const;
const DIGEST_C = `sha256:${'c'.repeat(64)}` as const;
const DIGEST_D = `sha256:${'d'.repeat(64)}` as const;
const RECORD_ID_A = 'mem_abcdef234567' as const;
const CANDIDATE_ID_A = 'cand_01hxyz9876543210abcdef' as const;
const IDEM_KEY_A = 'idem_0123456789abcdef0123456789' as const;
const INSTANT_T0 = '2026-10-17T12:00:00.000Z' as const;
const INSTANT_T1 = '2026-10-17T12:02:00.000Z' as const;
const INSTANT_T2 = '2026-10-17T12:04:00.000Z' as const;

function parseNeutralContractsAst(): ts.SourceFile {
  const source = readFileSync(NEUTRAL_CONTRACTS_PATH, 'utf8');
  return ts.createSourceFile(
    NEUTRAL_CONTRACTS_PATH,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
}

function extractStringUnionMembers(
  sf: ts.SourceFile,
  typeName: string,
): string[] {
  const members: string[] = [];
  for (const stmt of sf.statements) {
    if (
      ts.isTypeAliasDeclaration(stmt) &&
      stmt.name.text === typeName &&
      ts.isUnionTypeNode(stmt.type)
    ) {
      for (const t of stmt.type.types) {
        if (ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal)) {
          members.push(t.literal.text);
        }
      }
    }
  }
  return members;
}

function extractInterfacePropertyMap(
  sf: ts.SourceFile,
  interfaceName: string,
): Map<string, { optional: boolean }> {
  const props = new Map<string, { optional: boolean }>();
  for (const stmt of sf.statements) {
    if (
      ts.isInterfaceDeclaration(stmt) &&
      stmt.name.text === interfaceName
    ) {
      for (const member of stmt.members) {
        if (
          ts.isPropertySignature(member) &&
          member.name &&
          ts.isIdentifier(member.name)
        ) {
          props.set(member.name.text, {
            optional: member.questionToken !== undefined,
          });
        }
      }
    }
  }
  return props;
}

function buildValidCaptureInput(): CaptureInputV1 {
  return {
    idempotency_key: IDEM_KEY_A,
    payload: {
      schema_version: 2,
      purpose_ref: 'purpose:incident-analysis',
      valid_time: {
        t: 1792238400000,
        t_end: 1792324800000,
      },
      components: [
        {
          component_id: 'comp_primary',
          kind: 'decision',
          text: 'Use host-managed random pagination handles for recall.',
          citation_ids: ['cit_1'],
        },
      ],
      primary_component_id: 'comp_primary',
      primary_event: {
        at: 1792238400000,
        type_ref: 'event:architecture-decision',
        citation_id: 'cit_1',
      },
      citations: [
        {
          citation_id: 'cit_1',
          source_ref: 'source:spec-v2',
          locator: {
            scheme: 'file',
            value: 'spec/SPEC_MEMORY_MCP_V2.md#M3',
          },
          content_digest: DIGEST_A,
          observed_at: INSTANT_T0,
        },
      ],
      retention: {
        expires_at: '2026-11-17T12:00:00.000Z',
        derivative_rule: 'make-ineligible',
      },
      reconciliation: {
        family_refs: [],
      },
    },
    evidence: {
      evidence_ref: 'ev_bundle_01',
      evidence_digest: DIGEST_B,
      citation_ids: ['cit_1'],
      attestation: 'attestation:signed-receipt-01',
    },
  };
}

function buildValidSearchPage(): SearchPageV1 {
  return {
    records: [
      {
        record: {
          record_id: RECORD_ID_A,
          schema_version: 2,
          scope_ref: 'scope:tenant-a:project-1',
          purpose_ref: 'purpose:incident-analysis',
          valid_time: { t: 1792238400000 },
          components: [
            {
              component_id: 'comp_primary',
              kind: 'decision',
              text: 'Use host-managed random pagination handles.',
              citation_ids: ['cit_1'],
            },
          ],
          primary_component_id: 'comp_primary',
          primary_event: {
            at: 1792238400000,
            type_ref: 'event:decision',
            citation_id: 'cit_1',
          },
          citations: [
            {
              citation_id: 'cit_1',
              source_ref: 'source:spec',
              locator: { scheme: 'file', value: 'SPEC.md' },
              content_digest: DIGEST_A,
            },
          ],
        },
        redacted_fields: ['/retention', '/reconciliation'],
        redaction_receipt_digest: DIGEST_B,
        score: 0.95,
        rank: 1,
      },
    ],
    rank_receipt: {
      request_digest: DIGEST_A,
      authorization_receipt_digest: DIGEST_B,
      profile: 'offline_lexical_v1',
      profile_version: '1.0.0',
      profile_config_digest: DIGEST_C,
      valid_as_of: 1792238400000,
      system_as_of: '42',
      snapshot_id: 'snap_01',
      snapshot_digest: DIGEST_D,
      candidate_count: 1,
      candidate_ids_digest: DIGEST_A,
      scoring_formula_ref: 'bm25_v1',
      ordered_ids_digest: DIGEST_B,
      revalidation_receipt_digest: DIGEST_C,
      projection_receipt_digests: [DIGEST_D],
      issued_at: INSTANT_T0,
      receipt_digest: DIGEST_A,
    },
    next_page_cursor: 'page_handle_random_9f8e7d6c5b4a',
    response_digest: DIGEST_D,
  };
}

function buildValidReadPacket(): MemoryReadPacketV1 {
  return {
    record: {
      record_id: RECORD_ID_A,
    },
    redacted_fields: ['/components', '/citations'],
    redaction_receipt_digest: DIGEST_B,
    read_receipt: {
      record_id: RECORD_ID_A,
      record_digest: DIGEST_A,
      valid_as_of: 1792238400000,
      system_as_of: '42',
      validated_through_cursor: '42',
      authorization_receipt_digest: DIGEST_B,
      revalidation_receipt_digest: DIGEST_C,
      checked_at: INSTANT_T0,
      receipt_digest: DIGEST_D,
    },
    packet_digest: DIGEST_A,
  };
}

describe('MCP-L0 Normative Conformance against SPEC-memory-mcp-v2.md and engram-memory/contracts', () => {
  it('confronts src/mcp/memory declarations directly against engram-memory/contracts/index.ts AST and SPEC_MEMORY_MCP_V2.md', () => {
    const sf = parseNeutralContractsAst();
    const specMarkdown = readFileSync(SPEC_V2_PATH, 'utf8');

    // 1. Neutral MemoryErrorCode union totality & exact match
    const astErrorCodes = extractStringUnionMembers(sf, 'MemoryErrorCode');
    expect(astErrorCodes).toHaveLength(27);
    expect([...NEUTRAL_MEMORY_ERROR_CODES]).toEqual(astErrorCodes);

    // 2. Neutral RedactedMemoryRecordV2 property parity
    const redactedAstProps = extractInterfacePropertyMap(
      sf,
      'RedactedMemoryRecordV2',
    );
    expect(redactedAstProps.size).toBeGreaterThan(0);
    expect(REDACTED_MEMORY_RECORD_V2_SCHEMA.required).toEqual(['record_id']);
    for (const [propName, meta] of redactedAstProps.entries()) {
      expect(
        Object.keys(REDACTED_MEMORY_RECORD_V2_SCHEMA.properties),
      ).toContain(propName);
      if (propName === 'record_id') {
        expect(meta.optional).toBe(false);
      } else {
        expect(meta.optional).toBe(true);
      }
    }

    // 3. Neutral RecallRecordPacketV3, RankReceiptV1, MemoryReadReceiptV1, MemoryReadPacketV1, AdmissionOutcomeV1, LifecycleReceiptV1 property parity
    const schemaPairs: ReadonlyArray<
      [string, { required: readonly string[]; properties: Record<string, unknown> }]
    > = [
      ['RecallRecordPacketV3', RECALL_RECORD_PACKET_V3_SCHEMA],
      ['RankReceiptV1', RANK_RECEIPT_V1_SCHEMA],
      ['MemoryReadReceiptV1', MEMORY_READ_RECEIPT_V1_SCHEMA],
      ['MemoryReadPacketV1', MEMORY_READ_PACKET_V1_SCHEMA],
      ['AdmissionOutcomeV1', REQUEST_ADMISSION_RESULT_PAYLOAD_SCHEMA.properties.outcome],
      ['LifecycleReceiptV1', WITHDRAW_RESULT_PAYLOAD_SCHEMA.properties.receipt],
    ];

    for (const [ifaceName, schemaObj] of schemaPairs) {
      const astProps = extractInterfacePropertyMap(sf, ifaceName);
      expect([...astProps.keys()].sort()).toEqual(
        Object.keys(schemaObj.properties).sort(),
      );
      const requiredInAst = [...astProps.entries()]
        .filter(([, m]) => !m.optional)
        .map(([k]) => k)
        .sort();
      expect([...schemaObj.required].sort()).toEqual(requiredInAst);
    }

    // 4. Parse all ```ts code blocks in SPEC_MEMORY_MCP_V2.md and compare M2 DTOs against src/mcp/memory/contracts.ts & schemas.ts
    const tsBlocks = [...specMarkdown.matchAll(/```ts\n([\s\S]*?)```/g)].map(
      (m) => m[1],
    );
    const specTsSource = tsBlocks.join('\n\n');
    const specSf = ts.createSourceFile(
      'spec-blocks.ts',
      specTsSource,
      ts.ScriptTarget.Latest,
      true,
    );
    const contractsPath = join(ROOT, 'src', 'mcp', 'memory', 'contracts.ts');
    const contractsSf = ts.createSourceFile(
      contractsPath,
      readFileSync(contractsPath, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );

    function extractTypeLiteralProperties(
      sourceFile: ts.SourceFile,
      typeName: string,
    ): Map<string, { optional: boolean }> {
      const map = new Map<string, { optional: boolean }>();
      for (const stmt of sourceFile.statements) {
        if (
          ts.isTypeAliasDeclaration(stmt) &&
          stmt.name.text === typeName &&
          ts.isTypeLiteralNode(stmt.type)
        ) {
          for (const member of stmt.type.members) {
            if (
              ts.isPropertySignature(member) &&
              member.name &&
              ts.isIdentifier(member.name)
            ) {
              map.set(member.name.text, {
                optional: member.questionToken !== undefined,
              });
            }
          }
        }
      }
      return map;
    }

    const m2DtoSchemas: ReadonlyArray<
      [string, { required: readonly string[]; properties: Record<string, unknown> }]
    > = [
      ['SearchInputV1', ENGRAM_MEMORY_SEARCH_INPUT_SCHEMA],
      ['GetInputV1', ENGRAM_MEMORY_GET_INPUT_SCHEMA],
      ['CaptureInputV1', ENGRAM_MEMORY_CAPTURE_INPUT_SCHEMA],
      ['RequestAdmissionInputV1', ENGRAM_MEMORY_REQUEST_ADMISSION_INPUT_SCHEMA],
      ['WithdrawInputV1', ENGRAM_MEMORY_WITHDRAW_INPUT_SCHEMA],
      ['ForgetInputV1', ENGRAM_MEMORY_FORGET_INPUT_SCHEMA],
      ['SearchPageV1', SEARCH_RESULT_PAYLOAD_SCHEMA],
    ];

    for (const [dtoName, schemaObj] of m2DtoSchemas) {
      const specProps = extractTypeLiteralProperties(specSf, dtoName);
      const codeProps = extractTypeLiteralProperties(contractsSf, dtoName);
      expect(specProps.size).toBeGreaterThan(0);
      expect(codeProps).toEqual(specProps);
      expect([...specProps.keys()].sort()).toEqual(
        Object.keys(schemaObj.properties).sort(),
      );
      const requiredInSpec = [...specProps.entries()]
        .filter(([, m]) => !m.optional)
        .map(([k]) => k)
        .sort();
      expect([...schemaObj.required].sort()).toEqual(requiredInSpec);
    }

    for (const envelopeType of ['ToolSuccessV1', 'ToolFailureV1'] as const) {
      const specEnvProps = extractTypeLiteralProperties(specSf, envelopeType);
      const codeEnvProps = extractTypeLiteralProperties(
        contractsSf,
        envelopeType,
      );
      expect(specEnvProps.size).toBeGreaterThan(0);
      expect(codeEnvProps).toEqual(specEnvProps);
    }

    // 5. Confront M6 error section in SPEC_MEMORY_MCP_V2.md against PUBLIC_MEMORY_ERROR_CODES and MEMORY_ERROR_MAPPING_TABLE
    const m6Start = specMarkdown.indexOf('## M6. Total error mapping');
    const m7Start = specMarkdown.indexOf('## M7. Sentropic standard');
    expect(m6Start).toBeGreaterThan(0);
    expect(m7Start).toBeGreaterThan(m6Start);
    const m6Section = specMarkdown.slice(m6Start, m7Start);

    for (const code of PUBLIC_MEMORY_ERROR_CODES) {
      expect(
        m6Section.includes(`\`${code}\``),
        `Expected error code ${code} in SPEC_MEMORY_MCP_V2.md §M6`,
      ).toBe(true);
      expect(MEMORY_ERROR_MAPPING_TABLE[code].public_code).toBe(code);
      expect(MEMORY_ERROR_MAPPING_TABLE[code].retriable).toBe(
        MEMORY_ERROR_MAPPING_TABLE[code].retryable,
      );
    }
  });

  describe('Contract 1 — M2 Six Closed Tool Input Schemas & Validators', () => {
    it('validates SearchInputV1 valid and invalid examples against M2 bounds and NFC rules', () => {
      expect(
        ENGRAM_MEMORY_SEARCH_INPUT_SCHEMA.required,
      ).toEqual(['query', 'purpose_ref']);
      expect(
        Object.keys(ENGRAM_MEMORY_SEARCH_INPUT_SCHEMA.properties).sort(),
      ).toEqual(
        [
          'capability_policy',
          'limit',
          'max_packet_bytes',
          'page_cursor',
          'purpose_ref',
          'query',
        ].sort(),
      );

      // Valid minimal and full SearchInputV1
      expect(
        validateSearchInputV1({
          query: 'pagination handle bindings',
          purpose_ref: 'purpose:code-review',
        }).ok,
      ).toBe(true);

      expect(
        validateSearchInputV1({
          query: 'pagination handle bindings',
          purpose_ref: 'purpose:code-review',
          limit: 25,
          max_packet_bytes: 65536,
          capability_policy: DEFAULT_RECALL_CAPABILITY_POLICY,
          page_cursor: 'handle_random_01',
        }).ok,
      ).toBe(true);

      // Rejects legacy/invented fields (query_text, status_filter, memory_kinds, cursor)
      for (const forbidden of [
        { query_text: 'x', purpose_ref: 'p' },
        {
          query: 'x',
          purpose_ref: 'p',
          status_filter: 'admitted-and-disputed',
        },
        { query: 'x', purpose_ref: 'p', memory_kinds: ['fact'] },
        { query: 'x', purpose_ref: 'p', cursor: 'c' },
        { query: 'x', purpose_ref: 'p', limit: null },
      ]) {
        const res = validateSearchInputV1(forbidden);
        expect(res.ok).toBe(false);
      }

      // Rejects NFD non-NFC strings, empty query, and out-of-range limit / max_packet_bytes
      const nfdQuery = 'e\u0301'; // decomposed é
      expect(isWellFormedUnicodeAndNfc(nfdQuery)).toBe(false);
      expect(
        validateSearchInputV1({ query: nfdQuery, purpose_ref: 'p' }).ok,
      ).toBe(false);
      expect(
        validateSearchInputV1({ query: '   ', purpose_ref: 'p' }).ok,
      ).toBe(false);
      expect(
        validateSearchInputV1({
          query: 'a'.repeat(8193),
          purpose_ref: 'p',
        }).ok,
      ).toBe(false);
      expect(
        validateSearchInputV1({ query: 'x', purpose_ref: 'p', limit: 0 }).ok,
      ).toBe(false);
      expect(
        validateSearchInputV1({ query: 'x', purpose_ref: 'p', limit: 51 }).ok,
      ).toBe(false);
      expect(
        validateSearchInputV1({
          query: 'x',
          purpose_ref: 'p',
          max_packet_bytes: 4095,
        }).ok,
      ).toBe(false);
      expect(
        validateSearchInputV1({
          query: 'x',
          purpose_ref: 'p',
          max_packet_bytes: 1048577,
        }).ok,
      ).toBe(false);
    });

    it('validates GetInputV1 single record_id (^mem_[a-z2-7]+$), purpose_ref, and max_packet_bytes', () => {
      expect(ENGRAM_MEMORY_GET_INPUT_SCHEMA.required).toEqual([
        'record_id',
        'purpose_ref',
      ]);
      expect(
        validateGetInputV1({
          record_id: RECORD_ID_A,
          purpose_ref: 'purpose:lookup',
          max_packet_bytes: 16384,
        }).ok,
      ).toBe(true);

      // Rejects legacy memory_ids batch or malformed record_id
      expect(
        validateGetInputV1({ memory_ids: [RECORD_ID_A] }).ok,
      ).toBe(false);
      expect(
        validateGetInputV1({
          record_id: 'mem_INVALID_UPPER_0189',
          purpose_ref: 'purpose:lookup',
        }).ok,
      ).toBe(false);
      expect(
        validateGetInputV1({
          record_id: RECORD_ID_A,
        }).ok,
      ).toBe(false);
    });

    it('validates CaptureInputV1 and CapturePayloadInputV1 (V2 payload, EvidenceBundleV1, empty family_refs allowed, no caller scope_ref/derivation)', () => {
      const valid = buildValidCaptureInput();
      expect(validateCaptureInputV1(valid).ok).toBe(true);

      // Omitting optional retention and reconciliation is valid
      const withoutOptional: CaptureInputV1 = {
        idempotency_key: IDEM_KEY_A,
        payload: {
          schema_version: 2,
          purpose_ref: valid.payload.purpose_ref,
          valid_time: { t: 1792238400000 },
          components: valid.payload.components,
          primary_component_id: valid.payload.primary_component_id,
          primary_event: valid.payload.primary_event,
          citations: valid.payload.citations,
        },
        evidence: valid.evidence,
      };
      expect(validateCaptureInputV1(withoutOptional).ok).toBe(true);

      // Sorted unique non-empty family_refs is valid; unsorted or duplicate is rejected
      expect(
        validateCapturePayloadInputV1({
          ...valid.payload,
          reconciliation: { family_refs: ['fam_a', 'fam_b'] },
        }).ok,
      ).toBe(true);
      expect(
        validateCapturePayloadInputV1({
          ...valid.payload,
          reconciliation: { family_refs: ['fam_b', 'fam_a'] },
        }).ok,
      ).toBe(false);

      // Rejects caller-supplied scope_ref or derivation on CapturePayloadInputV1
      expect(
        validateCapturePayloadInputV1({
          ...valid.payload,
          scope_ref: 'scope:spoofed',
        }).ok,
      ).toBe(false);
      expect(
        validateCapturePayloadInputV1({
          ...valid.payload,
          derivation: {
            source_record_ids: [RECORD_ID_A],
            transform_ref: 'tr',
            transform_receipt_digest: DIGEST_A,
          },
        }).ok,
      ).toBe(false);

      // Rejects schema_version !== 2 or idempotency_key < 16 bytes
      expect(
        validateCapturePayloadInputV1({
          ...valid.payload,
          schema_version: 1,
        }).ok,
      ).toBe(false);
      expect(
        validateCaptureInputV1({
          ...valid,
          idempotency_key: 'short_key_15b',
        }).ok,
      ).toBe(false);

      // Rejects evidence referencing unknown citation_id
      expect(
        validateCaptureInputV1({
          ...valid,
          evidence: {
            ...valid.evidence,
            citation_ids: ['cit_unknown'],
          },
        }).ok,
      ).toBe(false);
    });

    it('validates RequestAdmissionInputV1, WithdrawInputV1, and ForgetInputV1 against M2', () => {
      expect(
        validateRequestAdmissionInputV1({
          candidate_id: CANDIDATE_ID_A,
          idempotency_key: IDEM_KEY_A,
        }).ok,
      ).toBe(true);
      // Rejects legacy memory_id or rationale_code
      expect(
        validateRequestAdmissionInputV1({
          memory_id: CANDIDATE_ID_A,
          idempotency_key: IDEM_KEY_A,
          rationale_code: 'ok',
        }).ok,
      ).toBe(false);

      expect(
        validateWithdrawInputV1({
          candidate_id: CANDIDATE_ID_A,
          idempotency_key: IDEM_KEY_A,
          reason_ref: 'reason:duplicate-candidate',
        }).ok,
      ).toBe(true);
      // Rejects legacy memory_id or reason_code or confirmation boolean in input
      expect(
        validateWithdrawInputV1({
          candidate_id: CANDIDATE_ID_A,
          idempotency_key: IDEM_KEY_A,
          reason_ref: 'reason:duplicate-candidate',
          confirmed: true,
        }).ok,
      ).toBe(false);

      expect(
        validateForgetInputV1({
          record_id: RECORD_ID_A,
          idempotency_key: IDEM_KEY_A,
          reason_ref: 'reason:user-erasure-request',
        }).ok,
      ).toBe(true);
      // Forget requires record_id matching ^mem_[a-z2-7]+$ (not candidate_id)
      expect(
        validateForgetInputV1({
          record_id: CANDIDATE_ID_A,
          idempotency_key: IDEM_KEY_A,
          reason_ref: 'reason:user-erasure-request',
        }).ok,
      ).toBe(false);
    });
  });

  describe('Contract 2 — Current-Memory-Only Disclosure (Disputed Memories Never Disclosed)', () => {
    it('restricts disclosable states strictly to accepted_current and excludes accepted_disputed', () => {
      expect(DISCLOSABLE_MEMORY_STATES).toEqual(['accepted_current']);
      expect(NON_DISCLOSABLE_MEMORY_STATES).toContain('accepted_disputed');
      expect(isDisclosableMemoryState('accepted_current')).toBe(true);
      expect(isDisclosableMemoryState('accepted_disputed')).toBe(false);
      for (const state of NON_DISCLOSABLE_MEMORY_STATES) {
        expect(isDisclosableMemoryState(state)).toBe(false);
      }

      expect(
        ENGRAM_MEMORY_TOOL_NEUTRAL_BINDINGS.engram_memory_search,
      ).toEqual({
        facet: 'MemoryRecallPortV3.recall',
        neutral_operation: 'recall_current',
      });
      expect(ENGRAM_MEMORY_TOOL_NEUTRAL_BINDINGS.engram_memory_get).toEqual({
        facet: 'MemoryReadPortV1.readCurrent',
        neutral_operation: 'recall_current',
      });
      expect(EXCLUDED_INTERNAL_MEMORY_OPERATIONS).toContain('recall_disputed');
      expect(EXCLUDED_INTERNAL_MEMORY_OPERATIONS).toContain('recall_history');
      expect(
        'status_filter' in ENGRAM_MEMORY_SEARCH_INPUT_SCHEMA.properties,
      ).toBe(false);
      expect(
        'status_filter' in SEARCH_RESULT_PAYLOAD_SCHEMA.properties,
      ).toBe(false);
    });
  });

  describe('Contract 3 — Neutral V3/V1 Read Facets & RedactedMemoryRecordV2 Consistency', () => {
    it('requires both MemoryRecallPortV3 (v3) and MemoryReadPortV1 (v1) and rejects v2 fallback', () => {
      const validFacets = verifyRequiredNeutralReadFacets({
        recallPort: { version: 3, recall: async () => ({ ok: true }) },
        readPort: { version: 1, readCurrent: async () => ({ ok: true }) },
      });
      expect(validFacets).toEqual({ ok: true, missing_facets: [] });

      const v2RecallFallback = verifyRequiredNeutralReadFacets({
        recallPort: { version: 2, recall: async () => ({ ok: true }) },
        readPort: { version: 1, readCurrent: async () => ({ ok: true }) },
      });
      expect(v2RecallFallback).toEqual({
        ok: false,
        error_code: 'CAPABILITY_UNAVAILABLE',
        missing_facets: ['MemoryRecallPortV3'],
      });
    });

    it('accepts RedactedMemoryRecordV2 with only record_id and enforces citation integrity on surviving components', () => {
      expect(REDACTED_MEMORY_RECORD_V2_JSON_SCHEMA).toBe(
        REDACTED_MEMORY_RECORD_V2_SCHEMA,
      );
      expect(
        validateRedactedMemoryRecordV2({ record_id: RECORD_ID_A }).ok,
      ).toBe(true);

      // Surviving component whose citation_id was redacted from citations is rejected
      expect(
        validateRedactedMemoryRecordV2({
          record_id: RECORD_ID_A,
          components: [
            {
              component_id: 'comp_1',
              kind: 'context',
              text: 'Surviving text',
              citation_ids: ['cit_missing'],
            },
          ],
          citations: [
            {
              citation_id: 'cit_present',
              source_ref: 'src_1',
              locator: { scheme: 'file', value: 'a.ts' },
              content_digest: DIGEST_A,
            },
          ],
        }).ok,
      ).toBe(false);
    });
  });

  describe('Contract 4 — Sentropic AppResultEnvelope (ToolSuccessV1 / ToolFailureV1) & Dual-Channel Transport', () => {
    it('enforces exact AppResultEnvelope structure on success and failure responses', () => {
      const page = buildValidSearchPage();
      const successResp = createToolSuccessEnvelope(
        page,
        'audit_search_001',
      );
      expect(successResp.isError).toBe(false);
      expect(successResp.structuredContent).toEqual({
        ok: true,
        output: {
          schema_version: ENGRAM_MEMORY_STRUCTURED_OUTPUT_SCHEMA_VERSION,
          value: page,
        },
        auditId: 'audit_search_001',
        redactionClass: 'high',
      });
      expect(
        validateMcpToolCallResponseV1('engram_memory_search', successResp).ok,
      ).toBe(true);

      // Rejects legacy { ok: true, schema_version: '1.0', tool, result } envelope
      expect(
        validateToolResultV1('engram_memory_search', {
          ok: true,
          schema_version: '1.0',
          tool: 'engram_memory_search',
          result: page,
        }).ok,
      ).toBe(false);

      // Failure envelope uses retriable (not retryable) and forbids details
      const failResp = mapNeutralMemoryErrorToPublic({
        tool: 'engram_memory_search',
        code: 'STORE_UNAVAILABLE',
        auditId: 'audit_err_001',
      });
      expect(failResp.isError).toBe(true);
      expect(failResp.structuredContent).toEqual({
        ok: false,
        auditId: 'audit_err_001',
        redactionClass: 'high',
        error: {
          code: 'STORE_UNAVAILABLE',
          message:
            MEMORY_ERROR_MAPPING_TABLE.STORE_UNAVAILABLE
              .default_sanitized_message,
          retriable: true,
        },
      });
      expect(
        validateMcpToolCallResponseV1('engram_memory_search', failResp).ok,
      ).toBe(true);

      expect(
        validateToolResultV1('engram_memory_search', {
          ...failResp.structuredContent,
          error: {
            ...failResp.structuredContent.error,
            details: { leaked: 'x' },
          },
        }).ok,
      ).toBe(false);
    });
  });

  describe('Contract 5 & 6 — Total Error Mapping Table & Zero Sensitive Disclosure in Errors', () => {
    it('maps all 27 neutral MemoryErrorCode values + 4 public codes (31 total) and maps MemoryErrorV1.denial and retryable', () => {
      expect(NEUTRAL_MEMORY_ERROR_CODES).toHaveLength(27);
      expect(ADDITIONAL_PUBLIC_MEMORY_ERROR_CODES).toEqual([
        'RESULT_TOO_LARGE',
        'RATE_LIMITED',
        'MUTATION_OUTCOME_UNKNOWN',
        'gate_failed',
      ]);
      expect(PUBLIC_MEMORY_ERROR_CODES).toHaveLength(31);
      expect(Object.keys(MEMORY_ERROR_MAPPING_TABLE)).toHaveLength(31);

      for (const code of PUBLIC_MEMORY_ERROR_CODES) {
        const mapped = mapNeutralMemoryErrorToPublic({
          tool: 'engram_memory_search',
          code,
          targetAuthorized: true,
        });
        expect(mapped.isError).toBe(true);
        expect(mapped.structuredContent.ok).toBe(false);
        if (!mapped.structuredContent.ok) {
          expect(mapped.structuredContent.error.code).toBe(code);
          expect(mapped.structuredContent.error.retriable).toBe(
            MEMORY_ERROR_MAPPING_TABLE[code].retriable,
          );
          expect(mapped.structuredContent.error.message).toBe(
            MEMORY_ERROR_MAPPING_TABLE[code].default_sanitized_message,
          );
        }
      }

      // Neutral MemoryErrorV1 with denial: true maps to UNAUTHORIZED (or NOT_FOUND pre-auth on target tools)
      const neutralDenial: MemoryErrorV1 = {
        code: 'STORE_UNAVAILABLE',
        operation: 'recall_current',
        message: 'Raw admin provider denial for secret_token_xyz',
        retryable: true,
        denial: true,
      };
      const mappedSearchDenial = mapNeutralMemoryErrorToPublic({
        tool: 'engram_memory_search',
        error: neutralDenial,
      });
      if (!mappedSearchDenial.structuredContent.ok) {
        expect(mappedSearchDenial.structuredContent.error.code).toBe(
          'UNAUTHORIZED',
        );
        expect(mappedSearchDenial.structuredContent.error.retriable).toBe(
          false,
        );
      }
    });

    it('normalizes pre-authorization target errors to NOT_FOUND across all 4 target-bearing tools including engram_memory_get', () => {
      expect([...TARGET_BEARING_MEMORY_TOOLS].sort()).toEqual(
        [
          'engram_memory_forget',
          'engram_memory_get',
          'engram_memory_request_admission',
          'engram_memory_withdraw',
        ].sort(),
      );

      const sensitiveCodes: PublicMemoryErrorCode[] = [
        'NOT_FOUND',
        'UNAUTHORIZED',
        'AUTHORIZATION_EXPIRED',
        'AUTHORIZATION_REVOKED',
        'ILLEGAL_TRANSITION',
        'ALREADY_TERMINAL',
        'DIGEST_CONFLICT',
        'BLOB_MISSING',
      ];

      for (const tool of TARGET_BEARING_MEMORY_TOOLS) {
        for (const code of sensitiveCodes) {
          const preAuth = mapNeutralMemoryErrorToPublic({
            tool,
            code,
            targetAuthorized: false,
            message: `Secret state leak for ${RECORD_ID_A} in /var/lib/engram/memory.db`,
            details: { target_id: RECORD_ID_A, state: 'accepted_disputed' },
          });
          if (!preAuth.structuredContent.ok) {
            expect(preAuth.structuredContent.error.code).toBe('NOT_FOUND');
            expect(preAuth.structuredContent.error.retriable).toBe(false);
            expect(preAuth.structuredContent.error.message).toBe(
              MEMORY_ERROR_MAPPING_TABLE.NOT_FOUND.default_sanitized_message,
            );
          }
        }
      }
    });

    it('never leaks filesystem paths, SQL, stack traces, record bodies, credentials, target IDs, or details in any error', () => {
      const sensitivePayloads = [
        '/var/lib/engram/memory.db: SQLITE_CORRUPT on record mem_secret234567',
        '/tmp/engram-test/candidate_payload_body_secret',
        '/opt/sentropic/credentials/bearer_eyJhbGciOiJIUzI1NiJ9',
        'SELECT plaintext FROM sealed_envelopes WHERE candidate_id = "cand_secret"',
        'Error: failed at Object.open (/home/user/src/store.ts:42:13)',
      ];

      for (const rawMessage of sensitivePayloads) {
        expect(
          sanitizePublicErrorMessage(rawMessage, 'Constant safe message.'),
        ).toBe('Constant safe message.');

        const mapped = mapNeutralMemoryErrorToPublic({
          tool: 'engram_memory_get',
          code: 'STORE_UNAVAILABLE',
          message: rawMessage,
          details: {
            db_path: '/var/lib/engram/memory.db',
            record_id: RECORD_ID_A,
            secret: 'bearer_xyz',
          },
          targetAuthorized: true,
        });

        const serialized = JSON.stringify(mapped);
        expect(serialized).not.toContain('/var/lib');
        expect(serialized).not.toContain('/tmp/');
        expect(serialized).not.toContain('/opt/');
        expect(serialized).not.toContain('SQLITE_CORRUPT');
        expect(serialized).not.toContain('bearer_');
        expect(serialized).not.toContain(RECORD_ID_A);
        expect(serialized).not.toContain('details');
      }

      // Dependency exception mapping: read vs commit-phase mutation
      const readEx = mapUnexpectedDependencyExceptionToPublic({
        tool: 'engram_memory_get',
        commitPhaseEntered: true,
      });
      if (!readEx.structuredContent.ok) {
        expect(readEx.structuredContent.error.code).toBe('STORE_UNAVAILABLE');
      }

      const writeCommitEx = mapUnexpectedDependencyExceptionToPublic({
        tool: 'engram_memory_capture',
        commitPhaseEntered: true,
      });
      if (!writeCommitEx.structuredContent.ok) {
        expect(writeCommitEx.structuredContent.error.code).toBe(
          'MUTATION_OUTCOME_UNKNOWN',
        );
        expect(writeCommitEx.structuredContent.error.retriable).toBe(true);
      }
    });
  });

  describe('Contract 7 — M7 Provider Manifest, CapabilityGates, Elicitation Policies, and Catalog Entries', () => {
    it('matches the M7 AppMcpProviderManifest, AppMcpToolDescriptor table, CapabilityGates, and CapabilityEntry projection', () => {
      expect(ENGRAM_MEMORY_PROVIDER_MANIFEST.appId).toBe('engram');
      expect(ENGRAM_MEMORY_PROVIDER_MANIFEST.providerId).toBe('engram-memory');
      expect(ENGRAM_MEMORY_PROVIDER_MANIFEST.version).toBe(
        ENGRAM_MEMORY_MCP_CONTRACT_VERSION,
      );
      expect(ENGRAM_MEMORY_PROVIDER_MANIFEST.displayName).toBe('Engram Memory');
      expect(ENGRAM_MEMORY_PROVIDER_MANIFEST.resources).toEqual([]);
      expect(ENGRAM_MEMORY_PROVIDER_MANIFEST.prompts).toEqual([]);
      expect(ENGRAM_MEMORY_PROVIDER_MANIFEST.authz).toEqual({
        requiredClaims: ['sub', 'tid'],
        scopes: ['mcp:discover', 'mcp:tools:invoke'],
        tenantResolution: 'custom-resolver',
      });
      expect(ENGRAM_MEMORY_PROVIDER_MANIFEST.audit).toEqual({
        eventKinds: ['invoke'],
        piiClass: 'high',
      });
      expect(ENGRAM_MEMORY_PROVIDER_MANIFEST.durability).toEqual({});
      expect(ENGRAM_MEMORY_PROVIDER_MANIFEST.secrets).toEqual([]);
      expect(ENGRAM_MEMORY_CONNECTOR_REGISTRATION.connectorId).toBe(
        'engram-memory',
      );

      const expectedDescriptors = {
        engram_memory_search: {
          mutability: 'read-only',
          category: 'read',
          externalMutation: false,
          idempotency: { required: false },
          requiresHumanConfirmation: false,
        },
        engram_memory_get: {
          mutability: 'read-only',
          category: 'read',
          externalMutation: false,
          idempotency: { required: false },
          requiresHumanConfirmation: false,
        },
        engram_memory_capture: {
          mutability: 'append',
          category: 'write',
          externalMutation: true,
          idempotency: { required: true, scope: 'principal' },
          requiresHumanConfirmation: false,
        },
        engram_memory_request_admission: {
          mutability: 'state-transition',
          category: 'write',
          externalMutation: true,
          idempotency: { required: true, scope: 'principal' },
          requiresHumanConfirmation: false,
        },
        engram_memory_withdraw: {
          mutability: 'state-transition',
          category: 'write',
          externalMutation: true,
          idempotency: { required: true, scope: 'principal' },
          requiresHumanConfirmation: true,
        },
        engram_memory_forget: {
          mutability: 'state-transition',
          category: 'write',
          externalMutation: true,
          idempotency: { required: true, scope: 'principal' },
          requiresHumanConfirmation: true,
        },
      } as const;

      for (const desc of ENGRAM_MEMORY_TOOL_DESCRIPTORS) {
        const exp = expectedDescriptors[desc.name];
        expect(desc.mutability).toBe(exp.mutability);
        expect(desc.category).toBe(exp.category);
        expect(desc.externalMutation).toBe(exp.externalMutation);
        expect(desc.idempotency).toEqual(exp.idempotency);
        expect(desc.gates).toEqual({
          requiresElicitation: false,
          requiresHumanConfirmation: exp.requiresHumanConfirmation,
          requiresPrincipalGate: false,
          requiresPolicy: true,
        });
      }

      for (const entry of SENTROPIC_MEMORY_CATALOG_ENTRIES) {
        expect(entry.kind).toBe('tool');
        expect(entry.sourceId).toBe('mcp:engram-memory');
        expect(entry.metadata.category).toBe('mcp');
        expect(entry.metadata.version).toBe('1.0.0');
        expect(entry.metadata.authzRequirements.permissions).toEqual([
          entry.rawName,
        ]);
        expect(entry.tool.requiresApproval).toBe(
          entry.rawName === 'engram_memory_withdraw' ||
            entry.rawName === 'engram_memory_forget',
        );
      }

      expect(
        evaluateToolGateRequirements('engram_memory_search', {
          hasPolicyGate: false,
        }),
      ).toEqual({
        allowed: false,
        failed_gate: 'requiresPolicy',
        error_code: 'gate_failed',
      });
      expect(
        evaluateToolGateRequirements('engram_memory_withdraw', {
          hasPolicyGate: true,
          hasHumanConfirmation: false,
        }),
      ).toEqual({
        allowed: false,
        failed_gate: 'requiresHumanConfirmation',
        error_code: 'gate_failed',
      });
    });
  });

  describe('Contract 8 — M2/M5 Lifecycle Output Contracts (Capture, RequestAdmission, Withdraw, Forget)', () => {
    it('validates CaptureOutputV1, RequestAdmissionOutputV1 (including pending_adjudication and duplicate_exact), WithdrawOutputV1, and ForgetOutputV1', () => {
      const validCaptureOut: CaptureOutputV1 = {
        status: 'committed_pending',
        candidate_id: CANDIDATE_ID_A,
        record_digest: DIGEST_A,
        cursor: '10',
        transaction_receipt_digest: DIGEST_B,
      };
      expect(validateCaptureOutputV1(validCaptureOut).ok).toBe(true);
      expect(
        validateCaptureOutputV1({
          status: 'candidate',
          memory_id: CANDIDATE_ID_A,
        }).ok,
      ).toBe(false);

      for (const status of [
        'accepted',
        'rejected',
        'pending_adjudication',
        'duplicate_exact',
      ] as const) {
        const admOut: RequestAdmissionOutputV1 = {
          outcome: {
            status,
            candidate_id: CANDIDATE_ID_A,
            ...(status === 'accepted' ? { record_id: RECORD_ID_A } : {}),
            cursor: '11',
            decision_receipt_digest: DIGEST_A,
            transaction_receipt_digest: DIGEST_B,
          },
          replayed: status === 'duplicate_exact',
        };
        expect(validateRequestAdmissionOutputV1(admOut).ok).toBe(true);
      }

      const validWithdrawOut: WithdrawOutputV1 = {
        receipt: {
          event_id: IDEM_KEY_A,
          operation: 'withdraw',
          from_state: 'pending',
          to_state: 'withdrawn',
          cursor: '12',
          event_digest: DIGEST_A,
          authorization_receipt_digest: DIGEST_B,
          transaction_receipt_digest: DIGEST_C,
        },
        replayed: false,
        key_destruction: 'complete',
      };
      expect(validateWithdrawOutputV1(validWithdrawOut).ok).toBe(true);

      // Withdraw only transitions pending -> withdrawn (never admitted/accepted_current)
      expect(
        validateWithdrawOutputV1({
          ...validWithdrawOut,
          receipt: {
            ...validWithdrawOut.receipt,
            from_state: 'accepted_current',
          },
        }).ok,
      ).toBe(false);

      for (const fromState of TOMBSTONE_ALLOWED_FROM_STATES) {
        const validForgetOut: ForgetOutputV1 = {
          receipt: {
            event_id: IDEM_KEY_A,
            operation: 'tombstone',
            from_state: fromState,
            to_state: 'tombstoned',
            cursor: '13',
            event_digest: DIGEST_A,
            authorization_receipt_digest: DIGEST_B,
            transaction_receipt_digest: DIGEST_C,
          },
          replayed: false,
          projection_invalidation: 'complete',
          coverage_receipt_digest: DIGEST_D,
        };
        expect(validateForgetOutputV1(validForgetOut).ok).toBe(true);
      }

      // Forget forbids coverage_receipt_digest when projection_invalidation is 'pending'
      expect(
        validateForgetOutputV1({
          receipt: {
            event_id: IDEM_KEY_A,
            operation: 'tombstone',
            from_state: 'accepted_current',
            to_state: 'tombstoned',
            cursor: '13',
            event_digest: DIGEST_A,
            authorization_receipt_digest: DIGEST_B,
            transaction_receipt_digest: DIGEST_C,
          },
          replayed: false,
          projection_invalidation: 'pending',
          coverage_receipt_digest: DIGEST_D,
        }).ok,
      ).toBe(false);
    });
  });

  describe('Contract 9, 10, 11 — Host Policy, Retention, Consent, Provenance, Elicitation Confirmation, & Durable Idempotency', () => {
    it('rejects retention expiration > ceiling and disallowed derivative_rule retain instead of clamping or downgrading', () => {
      const hostPolicy = {
        default_retention_days: 30,
        max_retention_days: 90,
        allow_retain_derivative_rule: false,
      };

      // Omitted retention defaults to derivative_rule: 'make-ineligible' and 30-day expiry
      const defaultRes = resolveCaptureRetentionPolicyV1({
        captured_at: INSTANT_T0,
        host_policy: hostPolicy,
      });
      expect(defaultRes.ok).toBe(true);
      if (defaultRes.ok) {
        expect(defaultRes.value.derivative_rule).toBe('make-ineligible');
      }

      // Expiration exceeding 90-day ceiling is REJECTED (never clamped)
      const excessiveExpiry = resolveCaptureRetentionPolicyV1({
        captured_at: INSTANT_T0,
        host_policy: hostPolicy,
        caller_retention: {
          expires_at: '2027-06-01T00:00:00.000Z',
          derivative_rule: 'make-ineligible',
        },
      });
      expect(excessiveExpiry).toEqual({
        ok: false,
        error_code: 'UNAUTHORIZED',
        message:
          'retention.expires_at exceeds the maximum host retention ceiling.',
      });

      // Disallowed 'retain' is REJECTED (never silently downgraded)
      const disallowedRetain = resolveCaptureRetentionPolicyV1({
        captured_at: INSTANT_T0,
        host_policy: hostPolicy,
        caller_retention: {
          derivative_rule: 'retain',
        },
      });
      expect(disallowedRetain).toEqual({
        ok: false,
        error_code: 'UNAUTHORIZED',
        message:
          "derivative_rule 'retain' is disallowed by host retention policy.",
      });
    });

    it('defaults omitted or empty reconciliation consent to { family_refs: [] } and rejects unconsented families', () => {
      const hostConsentPolicy = {
        consented_family_refs: ['fam_alpha', 'fam_beta'],
      };

      const omittedRes = resolveCaptureReconciliationConsentV1({
        host_policy: hostConsentPolicy,
      });
      expect(omittedRes).toEqual({
        ok: true,
        value: { family_refs: [] },
      });

      const emptyRes = resolveCaptureReconciliationHookV1({
        host_policy: hostConsentPolicy,
        caller_reconciliation: { family_refs: [] },
      });
      expect(emptyRes).toEqual({
        ok: true,
        value: { family_refs: [] },
      });

      const unconsentedRes = resolveCaptureReconciliationConsentV1({
        host_policy: hostConsentPolicy,
        caller_reconciliation: { family_refs: ['fam_alpha', 'fam_unconsented'] },
      });
      expect(unconsentedRes.ok).toBe(false);
      if (!unconsentedRes.ok) {
        expect(unconsentedRes.error_code).toBe('UNAUTHORIZED');
      }
    });

    it('mints neutral LifecycleEventAnchorV1, validates host elicitation confirm grants, and enforces M5 durable idempotency + tombstone recapture guard', () => {
      const anchorRes = createHostLifecycleEventAnchorV1({
        occurred_at: INSTANT_T0,
        kind_ref: 'mcp:engram_memory_withdraw',
        provenance_ref: 'prov:session-01:corr-01',
        provenance_digest: DIGEST_A,
      });
      expect(anchorRes).toEqual({
        ok: true,
        value: {
          occurred_at: INSTANT_T0,
          kind_ref: 'mcp:engram_memory_withdraw',
          provenance_ref: 'prov:session-01:corr-01',
          provenance_digest: DIGEST_A,
        },
      });

      const validGrant: DestructiveConfirmationGrantV1 = {
        elicitation_ref: 'elicit_01',
        capability: 'engram_memory_forget',
        mcp_client_id: 'client_h2a_01',
        session_id: 'sess_01',
        principal_id: 'prin_agent_01',
        tenant_id: 'tenant_01',
        scope_ref: 'scope:tenant_01:proj_01',
        target_ref: RECORD_ID_A,
        operation_digest: DIGEST_A,
        issued_at: INSTANT_T0,
        expires_at: INSTANT_T2,
        state: 'validated_resumed',
        request: {
          capability: 'engram_memory_forget',
          target_ref: RECORD_ID_A,
          operation_digest: DIGEST_A,
        },
        response: {
          approved: true,
        },
      };

      expect(
        verifyDestructiveConfirmationGrantV1(validGrant, {
          capability: 'engram_memory_forget',
          mcp_client_id: 'client_h2a_01',
          session_id: 'sess_01',
          principal_id: 'prin_agent_01',
          tenant_id: 'tenant_01',
          scope_ref: 'scope:tenant_01:proj_01',
          target_ref: RECORD_ID_A,
          operation_digest: DIGEST_A,
          now_utc: INSTANT_T1,
        }).ok,
      ).toBe(true);

      // Pending or mismatched operation_digest or secret-bearing request fails with gate_failed
      expect(
        verifyDestructiveConfirmationGrantV1(
          { ...validGrant, state: 'pending' },
          {
            capability: 'engram_memory_forget',
            mcp_client_id: 'client_h2a_01',
            session_id: 'sess_01',
            principal_id: 'prin_agent_01',
            tenant_id: 'tenant_01',
            scope_ref: 'scope:tenant_01:proj_01',
            target_ref: RECORD_ID_A,
            operation_digest: DIGEST_A,
            now_utc: INSTANT_T1,
          },
        ),
      ).toEqual({
        ok: false,
        error_code: 'gate_failed',
        message: "Elicitation confirmation state must be 'validated_resumed'.",
      });

      // M5 Durable operation reservation
      const opKey: DurableOperationKeyV1 = {
        principal_namespace: 'ns:sentropic',
        tenant_id: 'tenant_01',
        store_id: 'store_01',
        connector_id: 'engram-memory',
        scope_ref: 'scope:tenant_01:proj_01',
        tool_name: 'engram_memory_capture',
        tool_contract_version: '1.0.0',
        target_ref: CANDIDATE_ID_A,
        idempotency_key: IDEM_KEY_A,
      };
      const existingRecord: DurableOperationRecordV1<CaptureOutputV1> = {
        key: opKey,
        normalized_input_digest: DIGEST_A,
        status: 'completed',
        created_at: INSTANT_T0,
        candidate_id: CANDIDATE_ID_A,
        source_order: { source_ref: 'mcp:prin_agent_01', sequence: '1' },
        stored_output: {
          status: 'committed_pending',
          candidate_id: CANDIDATE_ID_A,
          record_digest: DIGEST_B,
          cursor: '1',
          transaction_receipt_digest: DIGEST_C,
        },
      };

      // Replay with identical digest sets status: 'duplicate_exact'
      const replayDec = evaluateIdempotentMutationStateV1(existingRecord, {
        key: opKey,
        normalized_input_digest: DIGEST_A,
        callerAuthorized: true,
      });
      expect(replayDec).toEqual({
        decision: 'replay_completed',
        output: {
          status: 'duplicate_exact',
          candidate_id: CANDIDATE_ID_A,
          record_digest: DIGEST_B,
          cursor: '1',
          transaction_receipt_digest: DIGEST_C,
        },
      });

      // Replay with different digest returns DIGEST_CONFLICT
      expect(
        evaluateIdempotentMutationStateV1(existingRecord, {
          key: opKey,
          normalized_input_digest: DIGEST_B,
          callerAuthorized: true,
        }),
      ).toEqual({
        decision: 'reject',
        error_code: 'DIGEST_CONFLICT',
        retriable: false,
      });

      // Replay when caller is no longer authorized fails closed
      expect(
        evaluateIdempotentMutationStateV1(existingRecord, {
          key: opKey,
          normalized_input_digest: DIGEST_A,
          callerAuthorized: false,
        }),
      ).toEqual({
        decision: 'reject',
        error_code: 'UNAUTHORIZED',
        retriable: false,
      });

      // Same-scope tombstone recapture guard refuses tombstoned payload digest
      expect(
        evaluateSameScopeTombstoneRecaptureGuardV1({
          scope_ref: 'scope:tenant_01:proj_01',
          candidate_payload_digest: DIGEST_A,
          tombstoned_payload_digests_in_scope: [DIGEST_A],
        }),
      ).toEqual({
        ok: false,
        error_code: 'ILLEGAL_TRANSITION',
        message:
          'Recapturing tombstoned content in the same scope is refused; tombstones are irreversible on the agent MCP surface.',
      });
    });
  });

  describe('Contract 12 — M3 Host-Managed Random Pagination Handle Validation', () => {
    const validHandleState: PaginationHandleStateV1 = {
      handle_id: 'page_handle_random_9f8e7d6c5b4a',
      engram_owns_signing_secret: false,
      principal_namespace: 'ns:sentropic',
      tenant_id: 'tenant_01',
      store_id: 'store_01',
      connector_instance_id: 'conn_inst_01',
      scope_ref: 'scope:tenant_01:proj_01',
      purpose_ref: 'purpose:incident-analysis',
      query: 'pagination handle bindings',
      query_digest: DIGEST_A,
      limit: 10,
      max_packet_bytes: 65536,
      capability_policy: DEFAULT_RECALL_CAPABILITY_POLICY,
      selected_profile: 'offline_lexical_v1',
      profile_version: '1.0.0',
      valid_as_of: Date.parse(INSTANT_T0),
      system_as_of: '42',
      internal_engine_cursor: 'engine_internal_opaque_cursor_1',
      policy_id: 'pol_01',
      policy_version: '1.0.0',
      authorization_epoch: '5',
      storage_epoch: '3',
      trust_revocation_epoch: '2',
      eligibility_digest: DIGEST_B,
      next_record_expiry_at: '2026-10-17T12:10:00.000Z',
      issued_at: INSTANT_T0,
      expires_at: '2026-10-17T12:05:00.000Z',
    };

    const validContReq: PaginationContinuationContextV1 = {
      page_cursor: 'page_handle_random_9f8e7d6c5b4a',
      reauthorized: true,
      principal_namespace: 'ns:sentropic',
      tenant_id: 'tenant_01',
      store_id: 'store_01',
      connector_instance_id: 'conn_inst_01',
      scope_ref: 'scope:tenant_01:proj_01',
      purpose_ref: 'purpose:incident-analysis',
      query: 'pagination handle bindings',
      query_digest: DIGEST_A,
      limit: 10,
      max_packet_bytes: 65536,
      capability_policy: DEFAULT_RECALL_CAPABILITY_POLICY,
      selected_profile: 'offline_lexical_v1',
      profile_version: '1.0.0',
      policy_id: 'pol_01',
      policy_version: '1.0.0',
      authorization_epoch: '5',
      storage_epoch: '3',
      trust_revocation_epoch: '2',
      eligibility_digest: DIGEST_B,
      now_utc: INSTANT_T1,
    };

    it('accepts a valid host-managed pagination handle and rejects raw cursors, expiry, or epoch drift with STALE_PAGE', () => {
      expect(
        validatePaginationHandleStateV1(validHandleState, validContReq).ok,
      ).toBe(true);

      // Raw engine cursor string rejected with STALE_PAGE
      const rawCursorRes = validatePaginationHandleStateV1(validHandleState, {
        ...validContReq,
        page_cursor: '42',
      });
      expect(rawCursorRes.ok).toBe(false);
      if (!rawCursorRes.ok) {
        expect(rawCursorRes.code).toBe('STALE_PAGE');
      }

      // Unknown handle state rejected with STALE_PAGE
      const missingRes = validatePaginationHandleStateV1(
        undefined,
        validContReq,
      );
      expect(missingRes.ok).toBe(false);
      if (!missingRes.ok) {
        expect(missingRes.code).toBe('STALE_PAGE');
      }

      // Expired handle rejected with STALE_PAGE
      const expiredRes = validatePaginationHandleStateV1(
        validHandleState,
        validContReq,
        '2026-10-17T12:06:00.000Z',
      );
      expect(expiredRes.ok).toBe(false);
      if (!expiredRes.ok) {
        expect(expiredRes.code).toBe('STALE_PAGE');
      }

      // Record expiry boundary crossed rejected with STALE_PAGE
      const recordExpiryCrossed = validatePaginationHandleStateV1(
        {
          ...validHandleState,
          expires_at: '2026-10-17T12:30:00.000Z',
          next_record_expiry_at: '2026-10-17T12:01:00.000Z',
        },
        validContReq,
        INSTANT_T1,
      );
      expect(recordExpiryCrossed.ok).toBe(false);
      if (!recordExpiryCrossed.ok) {
        expect(recordExpiryCrossed.code).toBe('STALE_PAGE');
      }

      // Epoch/query/scope drift rejected with STALE_PAGE
      for (const drifted of [
        { ...validContReq, query: 'different query' },
        { ...validContReq, purpose_ref: 'purpose:other' },
        { ...validContReq, authorization_epoch: '6' },
        { ...validContReq, storage_epoch: '4' },
        { ...validContReq, trust_revocation_epoch: '3' },
        { ...validContReq, eligibility_digest: DIGEST_C },
      ]) {
        const res = validatePaginationHandleStateV1(validHandleState, drifted);
        expect(res.ok).toBe(false);
        if (!res.ok) {
          expect(res.code).toBe('STALE_PAGE');
        }
      }

      // Failed reauthorization on continuation returns UNAUTHORIZED
      const unauthRes = validatePaginationHandleStateV1(validHandleState, {
        ...validContReq,
        reauthorized: false,
      });
      expect(unauthRes.ok).toBe(false);
      if (!unauthRes.ok) {
        expect(unauthRes.code).toBe('UNAUTHORIZED');
      }
    });
  });

  describe('Contract 13 — M8 Legacy Migration, M9 Packaging, M10 Topology, & M11 D10 Separation', () => {
    it('matches M8 legacy migration dispositions and M9 package/CLI boundaries verbatim', () => {
      expect(
        LEGACY_MIGRATION_DISPOSITIONS_V1.cluster_mesh_shadow_protocol_retired,
      ).toEqual({
        retired_operations: [
          'engram_write_shadow',
          'engram_query_shadow',
          'engram_promote_fact',
          'engram_ack_promotion',
        ],
        retired_symbols: [
          'H2aGraphifyMemoryPort',
          'createGraphifyMemoryAdapter',
        ],
        retired_files: [
          'packages/cluster-mesh/src/memory.ts',
          'packages/cluster-mesh/src/index.ts',
        ],
      });

      expect(
        LEGACY_MIGRATION_DISPOSITIONS_V1.h2a_legacy_memory_files_retired,
      ).toEqual([
        'packages/h2a/src/runtime/memory/admit-client.ts',
        'packages/h2a/src/runtime/memory/recall-client.ts',
        'packages/h2a/src/runtime/memory/promote-client.ts',
        'packages/h2a/src/runtime/memory/port-v1.ts',
        'packages/h2a/src/runtime/memory/port-v2-adapter.ts',
        'packages/h2a/src/runtime/memory/port-v2-compat.ts',
        'packages/h2a/src/runtime/memory/graphify-contracts-v2.vendored.ts',
        'packages/h2a/src/runtime/memory/d11-ceremony.ts',
      ]);

      expect(
        LEGACY_MIGRATION_DISPOSITIONS_V1.d11_two_leg_review_reanchoring,
      ).toEqual({
        decision_id: 'D11',
        retired_from: 'packages/h2a/src/runtime/memory/d11-ceremony.ts',
        replaces_legacy_operation: 'engram_ack_promotion',
        reanchored_on_operation: 'engram_memory_request_admission',
        reanchored_in: ['AdmissionPolicy', 'EvidenceVerifierPort'],
        forbidden_in_neutral_engram_memory_package: true,
      });

      expect(
        LEGACY_MIGRATION_DISPOSITIONS_V1.cluster_mesh_pin_migration
          .target_manifests,
      ).toEqual([
        'packages/h2a/package.json',
        'packages/h2a-runtime/package.json',
      ]);

      expect(PACKAGE_BOUNDARY_AND_CLI_CONTRACT_V1).toEqual({
        root_published_package_name: '@sentropic/engram',
        root_published_version: '0.20.0',
        optional_mcp_memory_export_subpath: '@sentropic/engram/mcp-memory',
        neutral_memory_package_name: 'engram-memory',
        neutral_memory_package_private: true,
        explicit_native_backend_dependencies: ['better-sqlite3', 'fs-ext'],
        mcp_sdk_dependency: '@modelcontextprotocol/sdk',
        mcp_sdk_min_version: '>=1.31.0',
        published_broker_dependency: '@sentropic/mcp-broker',
        default_engram_cli_excludes_memory_mcp_and_sqlite: true,
        engram_serve_excludes_memory_mcp: true,
      });

      expect(D10_CODE_GRAPH_SEPARATION_CONTRACT_V1.amended_on).toBe(
        '2026-04-16',
      );
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
    });
  });
});
