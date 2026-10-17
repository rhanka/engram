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
  DISCLOSABLE_MEMORY_STATES,
  ENGRAM_MEMORY_CANDIDATE_SCHEMA_VERSION,
  ENGRAM_MEMORY_CAPABILITY_GATES,
  ENGRAM_MEMORY_CAPTURE_INPUT_SCHEMA,
  ENGRAM_MEMORY_CAPTURE_OUTPUT_SCHEMA,
  ENGRAM_MEMORY_CAPTURE_PAYLOAD_INPUT_SCHEMA,
  ENGRAM_MEMORY_CONNECTOR_REGISTRATION,
  ENGRAM_MEMORY_ELICITATION_POLICIES,
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
  MEMORY_MUTATION_DIGEST_PROFILE_V1,
  MEMORY_READ_PACKET_V1_SCHEMA,
  MEMORY_READ_RECEIPT_V1_SCHEMA,
  MemoryConfirmationRequestV1Schema,
  MemoryConfirmationResponseV1Schema,
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
  TRUSTED_CONTEXT_UNAVAILABLE_PROTOCOL_ERROR,
  TrustedContextUnavailableProtocolError,
  UNVERIFIED_CROSS_TEAM_ITEMS_V1,
  WITHDRAW_RESULT_PAYLOAD_SCHEMA,
  canonicalizeMemoryMutationPreimageJcsV1,
  computeMemoryMutationOperationDigestV1,
  createHostLifecycleEventAnchorV1,
  createToolSuccessEnvelope,
  elicitationPolicyIsSecretSafe,
  evaluateClusterMeshMemoryInheritanceV1,
  evaluateIdempotentMutationStateV1,
  evaluateM5LifecycleTransitionV1,
  evaluatePrincipalScopedMutationLookupV1,
  evaluateSameScopeTombstoneRecaptureGuardV1,
  evaluateToolGateRequirements,
  extractMemoryMutationLookupKeyV1,
  guardTrustedAuditDispatchV1,
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
  projectMemoryMutationPolicyVersionsV1,
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
  validateMemoryMutationPreimageV1,
  validateMemoryReadReceiptV1,
  validatePaginationCursorBindingV1,
  validatePaginationHandleStateV1,
  validatePublishedJsonSchemaDraft202012,
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
  type MemoryMutationBindingV1,
  type MemoryMutationPreimageV1,
  type MemoryReadPacketV1,
  type PaginationContinuationContextV1,
  type PaginationHandleStateV1,
  type PublicMemoryErrorCode,
  type RequestAdmissionOutputV1,
  type SearchPageV1,
  type TrustedInvocationContextV1,
  type WithdrawOutputV1,
} from '../src/mcp/memory/index.js';
import {
  A05_MUTATION_DIGEST_VECTORS_SPEC_RULE,
  M1_SURFACE_SPEC_RULES,
  M2_AUDIT_MISSING_SPEC_RULE,
  M2_NUMERIC_AND_ARRAY_BOUNDARY_SPEC_RULES,
  M2_STRING_BOUNDARY_SPEC_RULES,
  M4_CLOSED_WORLD_AUTHZ_SPEC_RULES,
  M5_CROSS_TOOL_KEY_SPEC_RULES,
  M5_LIFECYCLE_TABLE_SPEC_RULES,
  M6_ERROR_MAPPING_SPEC_RULES,
  M7_MANIFEST_AND_DESCRIPTORS_SPEC_RULE,
  type StandardAppMcpProviderManifestWithElicitation,
  type StandardCapabilityTool,
  type StandardElicitationPolicy,
} from './fixtures/memory-mcp-spec-rules.js';

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
    it('maps all 27 neutral MemoryErrorCode values + 4 public codes (31 total) against M6_ERROR_MAPPING_SPEC_RULES and maps MemoryErrorV1.denial', () => {
      expect(NEUTRAL_MEMORY_ERROR_CODES).toHaveLength(27);
      expect(ADDITIONAL_PUBLIC_MEMORY_ERROR_CODES).toEqual([
        'RESULT_TOO_LARGE',
        'RATE_LIMITED',
        'MUTATION_OUTCOME_UNKNOWN',
        'gate_failed',
      ]);
      expect(PUBLIC_MEMORY_ERROR_CODES).toHaveLength(
        M6_ERROR_MAPPING_SPEC_RULES.length,
      );
      expect(Object.keys(MEMORY_ERROR_MAPPING_TABLE)).toHaveLength(
        M6_ERROR_MAPPING_SPEC_RULES.length,
      );

      for (const specRule of M6_ERROR_MAPPING_SPEC_RULES) {
        const code = specRule.code as PublicMemoryErrorCode;
        expect(MEMORY_ERROR_MAPPING_TABLE[code].public_code).toBe(
          specRule.code,
        );
        expect(MEMORY_ERROR_MAPPING_TABLE[code].retriable).toBe(
          specRule.retriable,
        );
        expect(
          MEMORY_ERROR_MAPPING_TABLE[code]
            .requires_target_authorization_for_detail,
        ).toBe(specRule.requires_target_authorization_for_detail);

        const mapped = mapNeutralMemoryErrorToPublic({
          tool: 'engram_memory_search',
          code,
          auditId: 'audit_m6_spec_01',
          targetAuthorized: true,
        });
        expect(mapped.isError).toBe(true);
        expect(mapped.structuredContent.ok).toBe(false);
        if (!mapped.structuredContent.ok) {
          expect(mapped.structuredContent.auditId).toBe('audit_m6_spec_01');
          expect(mapped.structuredContent.error.code).toBe(specRule.code);
          expect(mapped.structuredContent.error.retriable).toBe(
            specRule.retriable,
          );
          expect(
            mapped.structuredContent.error.message.length,
          ).toBeGreaterThan(10);
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
        auditId: 'audit_denial_01',
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

    it('normalizes pre-authorization target errors to NOT_FOUND across all 4 target-bearing tools when targetAuthorized is not literal true', () => {
      expect([...TARGET_BEARING_MEMORY_TOOLS].sort()).toEqual(
        [
          'engram_memory_forget',
          'engram_memory_get',
          'engram_memory_request_admission',
          'engram_memory_withdraw',
        ].sort(),
      );

      const sensitiveCodes = M6_ERROR_MAPPING_SPEC_RULES.filter(
        (r) =>
          r.requires_target_authorization_for_detail || r.code === 'NOT_FOUND',
      ).map((r) => r.code as PublicMemoryErrorCode);

      for (const tool of TARGET_BEARING_MEMORY_TOOLS) {
        for (const code of sensitiveCodes) {
          for (const verdict of M4_CLOSED_WORLD_AUTHZ_SPEC_RULES.rejected_verdicts) {
            const preAuth = mapNeutralMemoryErrorToPublic({
              tool,
              code,
              auditId: 'audit_preauth_01',
              targetAuthorized: verdict as unknown as boolean,
              message: `Secret state leak for ${RECORD_ID_A} in /var/lib/engram/memory.db`,
              details: { target_id: RECORD_ID_A, state: 'accepted_disputed' },
            });
            if (!preAuth.structuredContent.ok) {
              expect(preAuth.structuredContent.error.code).toBe('NOT_FOUND');
              expect(preAuth.structuredContent.error.retriable).toBe(false);
            }
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
          auditId: 'audit_sanitized_01',
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
        auditId: 'audit_dep_read_01',
      });
      if (!readEx.structuredContent.ok) {
        expect(readEx.structuredContent.error.code).toBe('STORE_UNAVAILABLE');
      }

      const writeCommitEx = mapUnexpectedDependencyExceptionToPublic({
        tool: 'engram_memory_capture',
        commitPhaseEntered: true,
        auditId: 'audit_dep_write_01',
      });
      if (!writeCommitEx.structuredContent.ok) {
        expect(writeCommitEx.structuredContent.error.code).toBe(
          'MUTATION_OUTCOME_UNKNOWN',
        );
        expect(writeCommitEx.structuredContent.error.retriable).toBe(true);
      }
    });
  });

  describe('Contract 7 — M7 Provider Manifest, CapabilityTool Descriptors, Elicitation Policies, and Catalog Entries (A10-R3-STANDARD)', () => {
    it('matches M7_MANIFEST_AND_DESCRIPTORS_SPEC_RULE and satisfies StandardAppMcpProviderManifestWithElicitation and StandardCapabilityTool field-by-field', () => {
      const manifestCheck: StandardAppMcpProviderManifestWithElicitation =
        ENGRAM_MEMORY_PROVIDER_MANIFEST;
      expect(manifestCheck.appId).toBe(
        M7_MANIFEST_AND_DESCRIPTORS_SPEC_RULE.manifest.appId,
      );
      expect(manifestCheck.providerId).toBe(
        M7_MANIFEST_AND_DESCRIPTORS_SPEC_RULE.manifest.providerId,
      );
      expect(manifestCheck.version).toBe(
        M7_MANIFEST_AND_DESCRIPTORS_SPEC_RULE.manifest.version,
      );
      expect(manifestCheck.displayName).toBe(
        M7_MANIFEST_AND_DESCRIPTORS_SPEC_RULE.manifest.displayName,
      );
      expect(manifestCheck.resources).toEqual(
        M7_MANIFEST_AND_DESCRIPTORS_SPEC_RULE.manifest.resources,
      );
      expect(manifestCheck.prompts).toEqual(
        M7_MANIFEST_AND_DESCRIPTORS_SPEC_RULE.manifest.prompts,
      );
      expect(manifestCheck.authz).toEqual(
        M7_MANIFEST_AND_DESCRIPTORS_SPEC_RULE.manifest.authz,
      );
      expect(manifestCheck.audit).toEqual(
        M7_MANIFEST_AND_DESCRIPTORS_SPEC_RULE.manifest.audit,
      );
      expect(manifestCheck.durability).toEqual(
        M7_MANIFEST_AND_DESCRIPTORS_SPEC_RULE.manifest.durability,
      );
      expect(manifestCheck.secrets).toEqual(
        M7_MANIFEST_AND_DESCRIPTORS_SPEC_RULE.manifest.secrets,
      );
      expect(ENGRAM_MEMORY_CONNECTOR_REGISTRATION.connectorId).toBe(
        'engram-memory',
      );
      expect(ENGRAM_MEMORY_CONNECTOR_REGISTRATION.providerId).toBe(
        M7_MANIFEST_AND_DESCRIPTORS_SPEC_RULE.manifest.providerId,
      );

      expect(ENGRAM_MEMORY_TOOL_DESCRIPTORS).toHaveLength(
        M7_MANIFEST_AND_DESCRIPTORS_SPEC_RULE.tools.length,
      );

      for (
        let i = 0;
        i < M7_MANIFEST_AND_DESCRIPTORS_SPEC_RULE.tools.length;
        i++
      ) {
        const expected = M7_MANIFEST_AND_DESCRIPTORS_SPEC_RULE.tools[i]!;
        const actual: StandardCapabilityTool =
          ENGRAM_MEMORY_TOOL_DESCRIPTORS[i]!;

        expect(actual.kind).toBe(expected.kind);
        expect(actual.name).toBe(expected.name);
        expect(actual.description).toBe(expected.description);
        expect(actual.requiredScopes).toEqual(expected.requiredScopes);
        expect(actual.requiredScopes).not.toContain('mcp:discover');
        expect(actual.requiredClaims).toEqual(expected.requiredClaims);
        expect(actual.redactionClass).toBe(expected.redactionClass);
        expect(actual.mutability).toBe(expected.mutability);
        expect(actual.category).toBe(expected.category);
        expect(actual.mutatesExternalSystem).toBe(
          expected.mutatesExternalSystem,
        );
        expect('externalMutation' in (actual as Record<string, unknown>)).toBe(
          false,
        );
        expect(actual.idempotency).toEqual(expected.idempotency);
        expect(actual.gates).toEqual(expected.gates);
        expect(actual.inputSchema).toBe(
          ENGRAM_MEMORY_TOOL_SCHEMAS[actual.name].inputSchema,
        );
        expect(actual.outputSchema).toBe(
          ENGRAM_MEMORY_TOOL_SCHEMAS[actual.name].outputSchema,
        );
      }

      expect(ENGRAM_MEMORY_PROVIDER_MANIFEST.elicitation).toHaveLength(
        M7_MANIFEST_AND_DESCRIPTORS_SPEC_RULE.elicitation.length,
      );
      for (
        let i = 0;
        i < M7_MANIFEST_AND_DESCRIPTORS_SPEC_RULE.elicitation.length;
        i++
      ) {
        const expEl = M7_MANIFEST_AND_DESCRIPTORS_SPEC_RULE.elicitation[i]!;
        const actEl: StandardElicitationPolicy =
          ENGRAM_MEMORY_ELICITATION_POLICIES[i]!;
        expect(actEl.toolName).toBe(expEl.toolName);
        expect(actEl.mode).toBe(expEl.mode);
        expect(actEl.required).toBe(expEl.required);
        expect(actEl.ttlSeconds).toBe(expEl.ttlSeconds);
        expect(actEl.carriesSecrets).toBe(expEl.carriesSecrets);
        expect(actEl.bindToClient).toBe(expEl.bindToClient);
        expect(actEl.bindToSub).toBe(expEl.bindToSub);
        expect(actEl.requestSchema).toBe(MemoryConfirmationRequestV1Schema);
        expect(actEl.responseSchema).toBe(MemoryConfirmationResponseV1Schema);
        expect(elicitationPolicyIsSecretSafe(actEl)).toBe(true);
      }

      const searchCat = SENTROPIC_MEMORY_CATALOG_ENTRIES[0]!;
      expect(searchCat).toEqual({
        ...M7_MANIFEST_AND_DESCRIPTORS_SPEC_RULE.search_catalog_entry,
        spec_line: undefined,
        tool: {
          ...M7_MANIFEST_AND_DESCRIPTORS_SPEC_RULE.search_catalog_entry.tool,
          inputSchema: ENGRAM_MEMORY_SEARCH_INPUT_SCHEMA,
          outputSchema: ENGRAM_MEMORY_SEARCH_OUTPUT_SCHEMA,
        },
      });

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

      for (const fromState of M1_SURFACE_SPEC_RULES.tombstone_allowed_from_states) {
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

      const defaultRes = resolveCaptureRetentionPolicyV1({
        captured_at: INSTANT_T0,
        host_policy: hostPolicy,
      });
      expect(defaultRes.ok).toBe(true);
      if (defaultRes.ok) {
        expect(defaultRes.value.derivative_rule).toBe('make-ineligible');
      }

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
        caller_reconciliation: {
          family_refs: ['fam_alpha', 'fam_unconsented'],
        },
      });
      expect(unconsentedRes.ok).toBe(false);
      if (!unconsentedRes.ok) {
        expect(unconsentedRes.error_code).toBe('UNAUTHORIZED');
      }
    });

    it('mints neutral LifecycleEventAnchorV1, validates host elicitation confirm grants, and enforces M5 durable idempotency + tombstone recapture -> pending_adjudication (A10-R4)', () => {
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

      // At the effect guard, now < expires_at is required (now === expires_at fails)
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
          now_utc: INSTANT_T2,
        }).ok,
      ).toBe(false);

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
        capture_policy_version: 'capture-policy/v1',
        policy_versions: {
          tool_name: 'engram_memory_capture',
          capture_policy_version: 'capture-policy/v1',
        },
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

      // A10-R4-RECAPTURE: same-scope tombstoned payload digest yields ok:true, isError:false, pending_adjudication (never ILLEGAL_TRANSITION)
      const recaptureRes = evaluateSameScopeTombstoneRecaptureGuardV1({
        scope_ref: 'scope:tenant_01:proj_01',
        candidate_payload_digest: DIGEST_A,
        tombstoned_payload_digests_in_scope: [DIGEST_A],
        ordinary_policy_decision: 'accept',
      });
      expect(recaptureRes).toEqual({
        ok: true,
        value: {
          isError: false,
          matched_same_scope_tombstone: true,
          automatic_acceptance_allowed: false,
          admission_status: 'pending_adjudication',
          effective_decision: 'adjudication_required',
        },
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

    it('accepts a valid host-managed pagination handle and rejects raw cursors, expiry, epoch drift, or non-true reauthorized with STALE_PAGE', () => {
      expect(
        validatePaginationHandleStateV1(validHandleState, validContReq).ok,
      ).toBe(true);

      const rawCursorRes = validatePaginationHandleStateV1(validHandleState, {
        ...validContReq,
        page_cursor: '42',
      });
      expect(rawCursorRes.ok).toBe(false);
      if (!rawCursorRes.ok) {
        expect(rawCursorRes.code).toBe('STALE_PAGE');
      }

      const missingRes = validatePaginationHandleStateV1(
        undefined,
        validContReq,
      );
      expect(missingRes.ok).toBe(false);
      if (!missingRes.ok) {
        expect(missingRes.code).toBe('STALE_PAGE');
      }

      const expiredRes = validatePaginationHandleStateV1(
        validHandleState,
        validContReq,
        '2026-10-17T12:06:00.000Z',
      );
      expect(expiredRes.ok).toBe(false);
      if (!expiredRes.ok) {
        expect(expiredRes.code).toBe('STALE_PAGE');
      }

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

      // Closed-world literal-true reauthorized check (M4 line 527, A10-R2):
      // undefined, false, null, 'true', 1 all return STALE_PAGE
      for (const verdict of M4_CLOSED_WORLD_AUTHZ_SPEC_RULES.rejected_verdicts) {
        const unauthRes = validatePaginationHandleStateV1(validHandleState, {
          ...validContReq,
          reauthorized: verdict as unknown as boolean,
        });
        expect(unauthRes.ok).toBe(false);
        if (!unauthRes.ok) {
          expect(unauthRes.code).toBe('STALE_PAGE');
        }
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
        CLUSTER_MESH_MEMORY_INHERITANCE_CONTRACT_V1.provider_id,
      ).toBe('sentropic.engram.memory');
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

  describe('L0-A10 — Round-2 Defect Closures (R1..R6) Against Normative Spec Fixture', () => {
    it('A10-R1-BYTES: separates character-count JSON Schema bounds from semantic UTF-8 byte validation and tests exact limit, limit+1, multi-byte, and empty/absent for every bounded field', () => {
      // Check published IdempotencyKey schema character-count bounds (minLength <= 4, maxLength >= 256)
      const idemRule = M2_STRING_BOUNDARY_SPEC_RULES.find(
        (r) => r.id === 'M2-STR-IDEMPOTENCY-KEY',
      )!;
      expect(
        ENGRAM_MEMORY_CAPTURE_INPUT_SCHEMA.properties.idempotency_key.minLength,
      ).toBeLessThanOrEqual(idemRule.max_allowed_schema_min_length);
      expect(
        ENGRAM_MEMORY_CAPTURE_INPUT_SCHEMA.properties.idempotency_key.maxLength,
      ).toBeGreaterThanOrEqual(idemRule.min_required_schema_max_length);

      const baseCapture = buildValidCaptureInput();

      // 8 NFC 'é' characters = 8 code points, 16 UTF-8 bytes -> passes BOTH published JSON Schema and semantic validator
      const eightE = {
        ...baseCapture,
        idempotency_key: idemRule.exact_min_multibyte!,
      };
      expect(
        validatePublishedJsonSchemaDraft202012(
          ENGRAM_MEMORY_CAPTURE_INPUT_SCHEMA,
          eightE,
        ).ok,
      ).toBe(true);
      expect(validateCaptureInputV1(eightE).ok).toBe(true);

      // 4 four-byte characters ('😀'.repeat(4)) = 4 code points, 16 UTF-8 bytes -> passes BOTH published JSON Schema and semantic validator
      const fourEmoji = {
        ...baseCapture,
        idempotency_key: idemRule.exact_min_four_byte!,
      };
      expect(
        validatePublishedJsonSchemaDraft202012(
          ENGRAM_MEMORY_CAPTURE_INPUT_SCHEMA,
          fourEmoji,
        ).ok,
      ).toBe(true);
      expect(validateCaptureInputV1(fourEmoji).ok).toBe(true);

      // 4 ASCII characters ('abcd') = 4 code points, 4 UTF-8 bytes -> passes structural character filter, FAILS semantic byte validator
      const fourAscii = {
        ...baseCapture,
        idempotency_key: 'abcd',
      };
      expect(
        validatePublishedJsonSchemaDraft202012(
          ENGRAM_MEMORY_CAPTURE_INPUT_SCHEMA,
          fourAscii,
        ).ok,
      ).toBe(true);
      expect(validateCaptureInputV1(fourAscii).ok).toBe(false);

      // 128 NFC 'é' characters = 256 UTF-8 bytes -> passes both; 129 'é' = 258 bytes -> fails semantic validator; 257 ASCII -> fails both
      const maxMultibyteKey = {
        ...baseCapture,
        idempotency_key: idemRule.exact_max_multibyte!,
      };
      expect(
        validatePublishedJsonSchemaDraft202012(
          ENGRAM_MEMORY_CAPTURE_INPUT_SCHEMA,
          maxMultibyteKey,
        ).ok,
      ).toBe(true);
      expect(validateCaptureInputV1(maxMultibyteKey).ok).toBe(true);

      expect(
        validateCaptureInputV1({
          ...baseCapture,
          idempotency_key: idemRule.over_max_multibyte!,
        }).ok,
      ).toBe(false);
      expect(
        validatePublishedJsonSchemaDraft202012(
          ENGRAM_MEMORY_CAPTURE_INPUT_SCHEMA,
          {
            ...baseCapture,
            idempotency_key: idemRule.over_limit_ascii,
          },
        ).ok,
      ).toBe(false);
      expect(
        validateCaptureInputV1({
          ...baseCapture,
          idempotency_key: idemRule.over_limit_ascii,
        }).ok,
      ).toBe(false);

      // Exercise all M2_STRING_BOUNDARY_SPEC_RULES (exact limit, limit+1, multi-byte at limit, multi-byte over limit, empty/absent)
      for (const rule of M2_STRING_BOUNDARY_SPEC_RULES) {
        if (rule.field_path === 'query') {
          expect(
            validatePublishedJsonSchemaDraft202012(
              ENGRAM_MEMORY_SEARCH_INPUT_SCHEMA,
              { query: rule.exact_limit_ascii, purpose_ref: 'p' },
            ).ok,
          ).toBe(true);
          expect(
            validateSearchInputV1({
              query: rule.exact_limit_ascii,
              purpose_ref: 'p',
            }).ok,
          ).toBe(true);
          expect(
            validateSearchInputV1({
              query: rule.exact_max_multibyte!,
              purpose_ref: 'p',
            }).ok,
          ).toBe(true);
          expect(
            validatePublishedJsonSchemaDraft202012(
              ENGRAM_MEMORY_SEARCH_INPUT_SCHEMA,
              { query: rule.over_limit_ascii, purpose_ref: 'p' },
            ).ok,
          ).toBe(false);
          expect(
            validateSearchInputV1({
              query: rule.over_limit_ascii,
              purpose_ref: 'p',
            }).ok,
          ).toBe(false);
          expect(
            validateSearchInputV1({
              query: rule.over_max_multibyte!,
              purpose_ref: 'p',
            }).ok,
          ).toBe(false);
          expect(
            validateSearchInputV1({
              query: rule.empty_value,
              purpose_ref: 'p',
            }).ok,
          ).toBe(false);
          expect(validateSearchInputV1({ purpose_ref: 'p' }).ok).toBe(false);
        } else if (rule.field_path === 'purpose_ref') {
          expect(
            validateSearchInputV1({
              query: 'q',
              purpose_ref: rule.exact_limit_ascii,
            }).ok,
          ).toBe(true);
          expect(
            validateSearchInputV1({
              query: 'q',
              purpose_ref: rule.exact_max_multibyte!,
            }).ok,
          ).toBe(true);
          expect(
            validateSearchInputV1({
              query: 'q',
              purpose_ref: rule.over_limit_ascii,
            }).ok,
          ).toBe(false);
          expect(
            validateSearchInputV1({
              query: 'q',
              purpose_ref: rule.over_max_multibyte!,
            }).ok,
          ).toBe(false);
          expect(
            validateSearchInputV1({
              query: 'q',
              purpose_ref: rule.empty_value,
            }).ok,
          ).toBe(false);
          expect(validateSearchInputV1({ query: 'q' }).ok).toBe(false);
        } else if (rule.field_path === 'candidate_id') {
          expect(
            validateRequestAdmissionInputV1({
              candidate_id: rule.exact_limit_ascii,
              idempotency_key: IDEM_KEY_A,
            }).ok,
          ).toBe(true);
          expect(
            validateRequestAdmissionInputV1({
              candidate_id: rule.exact_max_multibyte!,
              idempotency_key: IDEM_KEY_A,
            }).ok,
          ).toBe(true);
          expect(
            validateRequestAdmissionInputV1({
              candidate_id: rule.over_limit_ascii,
              idempotency_key: IDEM_KEY_A,
            }).ok,
          ).toBe(false);
          expect(
            validateRequestAdmissionInputV1({
              candidate_id: rule.over_max_multibyte!,
              idempotency_key: IDEM_KEY_A,
            }).ok,
          ).toBe(false);
          expect(
            validateRequestAdmissionInputV1({
              candidate_id: rule.empty_value,
              idempotency_key: IDEM_KEY_A,
            }).ok,
          ).toBe(false);
          expect(
            validateRequestAdmissionInputV1({
              idempotency_key: IDEM_KEY_A,
            }).ok,
          ).toBe(false);
        } else if (rule.field_path === 'reason_ref') {
          expect(
            validateWithdrawInputV1({
              candidate_id: CANDIDATE_ID_A,
              idempotency_key: IDEM_KEY_A,
              reason_ref: rule.exact_limit_ascii,
            }).ok,
          ).toBe(true);
          expect(
            validateWithdrawInputV1({
              candidate_id: CANDIDATE_ID_A,
              idempotency_key: IDEM_KEY_A,
              reason_ref: rule.exact_max_multibyte!,
            }).ok,
          ).toBe(true);
          expect(
            validateWithdrawInputV1({
              candidate_id: CANDIDATE_ID_A,
              idempotency_key: IDEM_KEY_A,
              reason_ref: rule.over_limit_ascii,
            }).ok,
          ).toBe(false);
          expect(
            validateWithdrawInputV1({
              candidate_id: CANDIDATE_ID_A,
              idempotency_key: IDEM_KEY_A,
              reason_ref: rule.over_max_multibyte!,
            }).ok,
          ).toBe(false);
          expect(
            validateWithdrawInputV1({
              candidate_id: CANDIDATE_ID_A,
              idempotency_key: IDEM_KEY_A,
              reason_ref: rule.empty_value,
            }).ok,
          ).toBe(false);
        } else if (
          rule.field_path === 'payload.citations[].citation_id' ||
          rule.field_path === 'payload.citations[].source_ref' ||
          rule.field_path === 'payload.citations[].locator.scheme' ||
          rule.field_path === 'payload.citations[].locator.value'
        ) {
          const makeCandidateWithCitationValue = (val: string) => {
            const cit = structuredClone(baseCapture.payload.citations[0]!);
            const comp = structuredClone(baseCapture.payload.components[0]!);
            const pe = structuredClone(baseCapture.payload.primary_event);
            const ev = structuredClone(baseCapture.evidence);
            if (rule.field_path.endsWith('citation_id')) {
              cit.citation_id = val;
              comp.citation_ids = [val];
              pe.citation_id = val;
              ev.citation_ids = [val];
            } else if (rule.field_path.endsWith('source_ref')) {
              cit.source_ref = val;
            } else if (rule.field_path.endsWith('scheme')) {
              cit.locator.scheme = val;
            } else {
              cit.locator.value = val;
            }
            return {
              ...baseCapture,
              payload: {
                ...baseCapture.payload,
                citations: [cit],
                components: [comp],
                primary_event: pe,
              },
              evidence: ev,
            };
          };

          const atLimitAscii = makeCandidateWithCitationValue(
            rule.exact_limit_ascii,
          );
          expect(
            validatePublishedJsonSchemaDraft202012(
              ENGRAM_MEMORY_CAPTURE_INPUT_SCHEMA,
              atLimitAscii,
            ).ok,
          ).toBe(true);
          expect(validateCaptureInputV1(atLimitAscii).ok).toBe(true);

          const atLimitMultibyte = makeCandidateWithCitationValue(
            rule.exact_max_multibyte!,
          );
          expect(
            validatePublishedJsonSchemaDraft202012(
              ENGRAM_MEMORY_CAPTURE_INPUT_SCHEMA,
              atLimitMultibyte,
            ).ok,
          ).toBe(true);
          expect(validateCaptureInputV1(atLimitMultibyte).ok).toBe(true);

          const overLimitAscii = makeCandidateWithCitationValue(
            rule.over_limit_ascii,
          );
          expect(
            validatePublishedJsonSchemaDraft202012(
              ENGRAM_MEMORY_CAPTURE_INPUT_SCHEMA,
              overLimitAscii,
            ).ok,
          ).toBe(false);
          expect(validateCaptureInputV1(overLimitAscii).ok).toBe(false);

          const overLimitMultibyte = makeCandidateWithCitationValue(
            rule.over_max_multibyte!,
          );
          expect(validateCaptureInputV1(overLimitMultibyte).ok).toBe(false);

          const emptyVal = makeCandidateWithCitationValue(rule.empty_value);
          expect(
            validatePublishedJsonSchemaDraft202012(
              ENGRAM_MEMORY_CAPTURE_INPUT_SCHEMA,
              emptyVal,
            ).ok,
          ).toBe(false);
          expect(validateCaptureInputV1(emptyVal).ok).toBe(false);
        } else if (rule.field_path === 'payload.components[].text') {
          const withText = (text: string) => ({
            ...baseCapture,
            payload: {
              ...baseCapture.payload,
              components: [
                {
                  ...baseCapture.payload.components[0]!,
                  text,
                },
              ],
            },
          });
          expect(
            validatePublishedJsonSchemaDraft202012(
              ENGRAM_MEMORY_CAPTURE_INPUT_SCHEMA,
              withText(rule.exact_limit_ascii),
            ).ok,
          ).toBe(true);
          expect(
            validateCaptureInputV1(withText(rule.exact_limit_ascii)).ok,
          ).toBe(true);
          expect(
            validateCaptureInputV1(withText(rule.exact_max_multibyte!)).ok,
          ).toBe(true);
          expect(
            validatePublishedJsonSchemaDraft202012(
              ENGRAM_MEMORY_CAPTURE_INPUT_SCHEMA,
              withText(rule.over_limit_ascii),
            ).ok,
          ).toBe(false);
          expect(
            validateCaptureInputV1(withText(rule.over_limit_ascii)).ok,
          ).toBe(false);
          expect(
            validateCaptureInputV1(withText(rule.over_max_multibyte!)).ok,
          ).toBe(false);
          expect(validateCaptureInputV1(withText(rule.empty_value)).ok).toBe(
            false,
          );
        } else if (rule.field_path === 'record_id') {
          expect(
            validateGetInputV1({
              record_id: rule.exact_limit_ascii,
              purpose_ref: 'p',
            }).ok,
          ).toBe(true);
          expect(
            validateGetInputV1({
              record_id: rule.over_limit_ascii,
              purpose_ref: 'p',
            }).ok,
          ).toBe(false);
          expect(
            validateGetInputV1({
              record_id: rule.non_ascii_rejection_sample!,
              purpose_ref: 'p',
            }).ok,
          ).toBe(false);
          expect(
            validateGetInputV1({
              record_id: rule.empty_value,
              purpose_ref: 'p',
            }).ok,
          ).toBe(false);
        } else if (rule.field_path === 'content_digest') {
          expect(isValidSha256Digest(rule.exact_limit_ascii)).toBe(true);
          expect(isValidSha256Digest(rule.over_limit_ascii)).toBe(false);
          expect(isValidSha256Digest(rule.non_ascii_rejection_sample!)).toBe(
            false,
          );
          expect(isValidSha256Digest(rule.empty_value)).toBe(false);
        } else if (rule.field_path === 'observed_at') {
          expect(isValidInstant(rule.exact_limit_ascii)).toBe(true);
          expect(isValidInstant(rule.over_limit_ascii)).toBe(false);
          expect(isValidInstant(rule.non_ascii_rejection_sample!)).toBe(false);
          expect(isValidInstant(rule.empty_value)).toBe(false);
        }
      }
    });

    it('A10-R2-TRUE: enforces closed-world literal-true (=== true) for every authorization, continuation, gate, and disclosure verdict (rejecting undefined, false, null, "true", 1)', () => {
      const opKey: DurableOperationKeyV1 = {
        principal_namespace: 'ns:sentropic',
        tenant_id: 'tenant_01',
        store_id: 'store_01',
        connector_id: 'engram-memory',
        scope_ref: 'scope:tenant_01:proj_01',
        tool_name: 'engram_memory_withdraw',
        tool_contract_version: '1.0.0',
        target_ref: CANDIDATE_ID_A,
        idempotency_key: IDEM_KEY_A,
      };
      const captureOpKey: DurableOperationKeyV1 = {
        ...opKey,
        tool_name: 'engram_memory_capture',
      };

      for (const nonTrue of M4_CLOSED_WORLD_AUTHZ_SPEC_RULES.rejected_verdicts) {
        // 1. evaluateIdempotentMutationStateV1 callerAuthorized on capture -> UNAUTHORIZED
        expect(
          evaluateIdempotentMutationStateV1(undefined, {
            key: captureOpKey,
            normalized_input_digest: DIGEST_A,
            callerAuthorized: nonTrue as unknown as boolean,
          }),
        ).toEqual({
          decision: 'reject',
          error_code: 'UNAUTHORIZED',
          retriable: false,
        });

        // 2. evaluateIdempotentMutationStateV1 targetAuthorized on withdraw -> NOT_FOUND
        expect(
          evaluateIdempotentMutationStateV1(undefined, {
            key: opKey,
            normalized_input_digest: DIGEST_A,
            callerAuthorized: true,
            targetAuthorized: nonTrue as unknown as boolean,
          }),
        ).toEqual({
          decision: 'reject',
          error_code: 'NOT_FOUND',
          retriable: false,
        });

        // 3. mapNeutralMemoryErrorToPublic targetAuthorized on forget -> normalizes ALREADY_TERMINAL to NOT_FOUND
        const mapped = mapNeutralMemoryErrorToPublic({
          tool: 'engram_memory_forget',
          code: 'ALREADY_TERMINAL',
          auditId: 'audit_r2_01',
          targetAuthorized: nonTrue as unknown as boolean,
        });
        expect(mapped.structuredContent.ok).toBe(false);
        if (!mapped.structuredContent.ok) {
          expect(mapped.structuredContent.error.code).toBe('NOT_FOUND');
        }

        // 4. evaluateToolGateRequirements hasPolicyGate / hasHumanConfirmation
        expect(
          evaluateToolGateRequirements('engram_memory_search', {
            hasPolicyGate: nonTrue as unknown as boolean,
          }).allowed,
        ).toBe(false);
        expect(
          evaluateToolGateRequirements('engram_memory_withdraw', {
            hasPolicyGate: true,
            hasHumanConfirmation: nonTrue as unknown as boolean,
          }).allowed,
        ).toBe(false);

        // 5. evaluateClusterMeshMemoryInheritanceV1
        expect(
          evaluateClusterMeshMemoryInheritanceV1({
            host_config_persisted: true,
            host_memory_mcp_enabled: nonTrue as unknown as boolean,
            tenant_policy_persisted: true,
            tenant_memory_mcp_enabled: true,
            cluster_mesh_memory_module_available: true,
          }).enabled,
        ).toBe(false);
      }

      // Literal true allows target-authorized ALREADY_TERMINAL disclosure
      const allowedDisclosure = mapNeutralMemoryErrorToPublic({
        tool: 'engram_memory_forget',
        code: 'ALREADY_TERMINAL',
        auditId: 'audit_r2_02',
        targetAuthorized: true,
      });
      if (!allowedDisclosure.structuredContent.ok) {
        expect(allowedDisclosure.structuredContent.error.code).toBe(
          'ALREADY_TERMINAL',
        );
      }
    });

    it('A10-R4-RECAPTURE & M5 Table: enumerates every M5 lifecycle transition row from M5_LIFECYCLE_TABLE_SPEC_RULES', () => {
      for (const row of M5_LIFECYCLE_TABLE_SPEC_RULES) {
        const res = evaluateM5LifecycleTransitionV1({
          tool: row.tool,
          prior_state: row.prior_state,
          callerAuthorized: true,
          targetAuthorized: true,
          same_scope_tombstone_match: row.same_scope_tombstone_match,
          other_scope_tombstone_match: row.other_scope_tombstone_match,
          policy_decision: row.policy_decision,
        });

        expect(res.ok).toBe(row.expected_ok);
        expect(res.isError).toBe(row.expected_is_error);
        if (row.expected_ok && res.ok) {
          expect(res.next_state).toBe(row.expected_next_state);
          if (row.expected_admission_status !== undefined) {
            expect(res.admission_status).toBe(row.expected_admission_status);
          }
        } else if (!row.expected_ok && !res.ok) {
          expect(res.error_code).toBe(row.expected_error_code);
        }
      }

      // Other-scope tombstones never prevent automatic acceptance or leak across scopes
      const otherScopeGuard = evaluateSameScopeTombstoneRecaptureGuardV1({
        scope_ref: 'scope:project:alpha',
        candidate_payload_digest: DIGEST_A,
        tombstoned_payload_digests_in_scope: [],
        tombstoned_payload_digests_in_other_scopes: [DIGEST_A],
        ordinary_policy_decision: 'accept',
      });
      expect(otherScopeGuard).toEqual({
        ok: true,
        value: {
          isError: false,
          matched_same_scope_tombstone: false,
          automatic_acceptance_allowed: true,
          admission_status: 'accepted',
          effective_decision: 'accept',
        },
      });
    });

    it('A10-R5-AUDIT / M2-AUDIT-MISSING: refuses missing or invalid auditId at the protocol boundary with -32603 and zero domain envelope or synthetic audit_mcp_l0_default', () => {
      let providerCalled = false;
      for (const invalidAudit of [undefined, null, '', '   ', 123, 'e\u0301']) {
        const guardRes = guardTrustedAuditDispatchV1(invalidAudit, () => {
          providerCalled = true;
          return createToolSuccessEnvelope(
            buildValidSearchPage(),
            'audit_unreachable',
          );
        });
        expect(providerCalled).toBe(false);
        expect(guardRes).toEqual({
          ok: false,
          protocolError: {
            code: M2_AUDIT_MISSING_SPEC_RULE.protocol_error_code,
            message: M2_AUDIT_MISSING_SPEC_RULE.protocol_error_message,
          },
          providerDispatched: false,
          reservationCreated: false,
          canonicalEffectCommitted: false,
        });
        expect('response' in guardRes).toBe(false);
        expect('structuredContent' in guardRes).toBe(false);
      }

      expect(TRUSTED_CONTEXT_UNAVAILABLE_PROTOCOL_ERROR).toEqual({
        code: M2_AUDIT_MISSING_SPEC_RULE.protocol_error_code,
        message: M2_AUDIT_MISSING_SPEC_RULE.protocol_error_message,
      });

      // Calling envelope/error builders without a valid auditId throws TrustedContextUnavailableProtocolError (-32603)
      expect(() =>
        createToolSuccessEnvelope(buildValidSearchPage(), ''),
      ).toThrowError(TrustedContextUnavailableProtocolError);
      expect(() =>
        mapNeutralMemoryErrorToPublic({
          tool: 'engram_memory_search',
          code: 'STORE_UNAVAILABLE',
          auditId: '' as string,
        }),
      ).toThrowError(TrustedContextUnavailableProtocolError);

      // Valid trusted auditId passes through unchanged
      const validDispatch = guardTrustedAuditDispatchV1(
        'audit_trusted_host_99',
        (trustedId) =>
          createToolSuccessEnvelope(buildValidSearchPage(), trustedId),
      );
      expect(validDispatch.ok).toBe(true);
      if (validDispatch.ok) {
        expect(validDispatch.response.structuredContent.auditId).toBe(
          'audit_trusted_host_99',
        );
        expect(validDispatch.response.structuredContent.auditId).not.toBe(
          M2_AUDIT_MISSING_SPEC_RULE.forbidden_fallback_audit_id,
        );
      }
    });

    it('A10-R6-POLICY & L0-A05 & M5-CROSS-TOOL-KEY: verifies canonical RFC 8785 JCS bytes, SHA-256 operation digests, policy-version-only changes, missing-version refusal, and cross-tool idempotency key conflicts', () => {
      const { vectors } = A05_MUTATION_DIGEST_VECTORS_SPEC_RULE;

      // 1. Capture v1 & v2 (policy-version-only change alters canonical JCS bytes and SHA-256 digest)
      const capV1Res = computeMemoryMutationOperationDigestV1(
        vectors.capture_v1.preimage,
      );
      expect(capV1Res.ok).toBe(true);
      if (capV1Res.ok) {
        expect(capV1Res.value.canonical_jcs_utf8).toBe(
          vectors.capture_v1.expected_jcs_utf8,
        );
        expect(capV1Res.value.operation_digest).toBe(
          vectors.capture_v1.expected_digest,
        );
        expect(capV1Res.value.policy_versions).toEqual({
          tool_name: 'engram_memory_capture',
          capture_policy_version: 'capture-policy/v1',
        });
      }

      const capV2Preimage: MemoryMutationPreimageV1 = {
        ...vectors.capture_v1.preimage,
        effective_input: {
          ...vectors.capture_v1.preimage.effective_input,
          capture_policy_version: 'capture-policy/v2',
        },
      };
      const capV2Res = computeMemoryMutationOperationDigestV1(capV2Preimage);
      expect(capV2Res.ok).toBe(true);
      if (capV2Res.ok) {
        expect(capV2Res.value.canonical_jcs_utf8).toBe(
          vectors.capture_v2.expected_jcs_utf8,
        );
        expect(capV2Res.value.operation_digest).toBe(
          vectors.capture_v2.expected_digest,
        );
        expect(capV2Res.value.operation_digest).not.toBe(
          vectors.capture_v1.expected_digest,
        );
      }

      // 2. Request admission v1 & v2 (policy-version-only change alters canonical JCS bytes and SHA-256 digest)
      const admV1Res = computeMemoryMutationOperationDigestV1(
        vectors.request_admission_v1.preimage,
      );
      expect(admV1Res.ok).toBe(true);
      if (admV1Res.ok) {
        expect(admV1Res.value.canonical_jcs_utf8).toBe(
          vectors.request_admission_v1.expected_jcs_utf8,
        );
        expect(admV1Res.value.operation_digest).toBe(
          vectors.request_admission_v1.expected_digest,
        );
      }

      const admV2Preimage: MemoryMutationPreimageV1 = {
        ...vectors.request_admission_v1.preimage,
        effective_input: {
          ...vectors.request_admission_v1.preimage.effective_input,
          admission_policy_version: 'admission-policy/v2',
        },
      };
      const admV2Res = computeMemoryMutationOperationDigestV1(admV2Preimage);
      expect(admV2Res.ok).toBe(true);
      if (admV2Res.ok) {
        expect(admV2Res.value.canonical_jcs_utf8).toBe(
          vectors.request_admission_v2.expected_jcs_utf8,
        );
        expect(admV2Res.value.operation_digest).toBe(
          vectors.request_admission_v2.expected_digest,
        );
      }

      // 3. Withdraw & Forget vectors
      const wdrRes = computeMemoryMutationOperationDigestV1(
        vectors.withdraw_v1.preimage,
      );
      expect(wdrRes.ok).toBe(true);
      if (wdrRes.ok) {
        expect(wdrRes.value.canonical_jcs_utf8).toBe(
          vectors.withdraw_v1.expected_jcs_utf8,
        );
        expect(wdrRes.value.operation_digest).toBe(
          vectors.withdraw_v1.expected_digest,
        );
        expect(wdrRes.value.policy_versions).toEqual({
          tool_name: 'engram_memory_withdraw',
        });
      }

      const fgtRes = computeMemoryMutationOperationDigestV1(
        vectors.forget_v1.preimage,
      );
      expect(fgtRes.ok).toBe(true);
      if (fgtRes.ok) {
        expect(fgtRes.value.canonical_jcs_utf8).toBe(
          vectors.forget_v1.expected_jcs_utf8,
        );
        expect(fgtRes.value.operation_digest).toBe(
          vectors.forget_v1.expected_digest,
        );
        expect(fgtRes.value.policy_versions).toEqual({
          tool_name: 'engram_memory_forget',
        });
      }

      // 4. Omitting capture_policy_version or admission_policy_version or passing "current" fails before hashing
      const { capture_policy_version: _omittedCapVer, ...capWithoutVer } =
        vectors.capture_v1.preimage.effective_input;
      expect(
        computeMemoryMutationOperationDigestV1({
          ...vectors.capture_v1.preimage,
          effective_input: capWithoutVer,
        }).ok,
      ).toBe(false);
      expect(
        computeMemoryMutationOperationDigestV1({
          ...vectors.capture_v1.preimage,
          effective_input: {
            ...vectors.capture_v1.preimage.effective_input,
            capture_policy_version: 'current',
          },
        }).ok,
      ).toBe(false);
      expect(
        projectMemoryMutationPolicyVersionsV1({
          tool_name: 'engram_memory_withdraw',
          capture_policy_version: 'capture-policy/v1',
        }).ok,
      ).toBe(false);

      // 5. Uncommitted reservation with stale domain policy version returns POLICY_STALE; committed replays
      const uncommittedBinding: MemoryMutationBindingV1<CaptureOutputV1> = {
        lookup_key: extractMemoryMutationLookupKeyV1(
          vectors.capture_v1.preimage,
        ),
        preimage: vectors.capture_v1.preimage,
        operation_digest: vectors.capture_v1.expected_digest,
        policy_versions: {
          tool_name: 'engram_memory_capture',
          capture_policy_version: 'capture-policy/v1',
        },
        recovery_state: 'authorized_uncommitted',
        audit_id: 'audit_cap_01',
        execution_generation: '1',
      };
      expect(
        evaluatePrincipalScopedMutationLookupV1([uncommittedBinding], {
          preimage: vectors.capture_v1.preimage,
          callerAuthorized: true,
          active_domain_policy_version: 'capture-policy/v2',
        }),
      ).toEqual({
        decision: 'reject',
        error_code: 'POLICY_STALE',
        retriable: true,
      });

      // 6. M5-CROSS-TOOL-KEY: reusing the same idempotency_key across tools in the same 9-tuple namespace returns DIGEST_CONFLICT
      const lookupKey = extractMemoryMutationLookupKeyV1(
        vectors.capture_v1.preimage,
      );
      expect(Object.keys(lookupKey).sort()).toEqual(
        [...M5_CROSS_TOOL_KEY_SPEC_RULES.lookup_key_fields].sort(),
      );
      for (const excluded of M5_CROSS_TOOL_KEY_SPEC_RULES.excluded_from_lookup_key) {
        expect(excluded in lookupKey).toBe(false);
      }

      const withdrawSameKeyPreimage: MemoryMutationPreimageV1 = {
        ...vectors.withdraw_v1.preimage,
        idempotency_key: vectors.capture_v1.preimage.idempotency_key,
      };
      expect(
        evaluatePrincipalScopedMutationLookupV1([uncommittedBinding], {
          preimage: withdrawSameKeyPreimage,
          callerAuthorized: true,
          targetAuthorized: true,
        }),
      ).toEqual({
        decision: 'reject',
        error_code: 'DIGEST_CONFLICT',
        retriable: false,
      });
    });
  });
});
