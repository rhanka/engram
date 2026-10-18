import { describe, expect, it } from 'vitest';
import {
  ENGRAM_MEMORY_GET_INPUT_SCHEMA,
  ENGRAM_MEMORY_PUBLISHER_ENTRY_V1,
  ENGRAM_MEMORY_SELECTION_POLICY_BINDING_V1,
  createToolSuccessEnvelope,
  evaluateMemorySelectionAndRevocationV1,
  validateMcpToolCallResponseV1,
  validateMemoryPublisherEntryV1,
  validateMemoryToolSchemaDialectV1,
  validatePublishedJsonSchemaDraft202012,
} from '../src/mcp/memory/index.js';

describe('MCP-L0b contract corrections (Sol review)', () => {
  it('closure rejects constructor:undeclared as undeclared property', () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['a'],
      properties: { a: { type: 'string' } },
    } as unknown as Record<string, unknown>;
    const res = validatePublishedJsonSchemaDraft202012(schema, {
      a: 'x',
      constructor: 'undeclared',
    });
    expect(res.ok).toBe(false);
  });

  it('closure rejects constructor on published GetInput schema', () => {
    const res = validatePublishedJsonSchemaDraft202012(
      ENGRAM_MEMORY_GET_INPUT_SCHEMA as unknown as Record<string, unknown>,
      {
        record_id: 'mem_abcdef234567',
        purpose_ref: 'purpose:engineering',
        constructor: 'undeclared',
      },
    );
    expect(res.ok).toBe(false);
  });

  it('cache key binds the connector instance', () => {
    expect(
      Array.from(
        ENGRAM_MEMORY_SELECTION_POLICY_BINDING_V1.catalog_cache_key_fields,
      ),
    ).toContain('connector_instance_id');
    const base = {
      tenant_opted_in: true,
      agent_selected: true,
      tool_permitted: true,
      plan_compiled: true,
      has_collision: false,
      has_verified_call_context: true,
      disabled: false,
      call_generation: '3',
      active_generation: '3',
    } as const;
    expect(
      evaluateMemorySelectionAndRevocationV1({
        ...base,
        cache_key: {
          tenant_id: 'ten_01',
          principal_id: 'usr_alice',
          agent_id: 'agent_coder',
          policy_epoch: '4',
          provider_id: 'sentropic.engram.memory' as const,
          provider_version: '1.0.0',
          source_id: 'mcp:engram-memory' as const,
          plan_generation: '3',
        } as never,
      }),
    ).toEqual({ allowed: false, refusal_code: 'invalid_cache_key' });
    const withInstance = {
      tenant_id: 'ten_01',
      principal_id: 'usr_alice',
      agent_id: 'agent_coder',
      policy_epoch: '4',
      provider_id: 'sentropic.engram.memory' as const,
      provider_version: '1.0.0',
      source_id: 'mcp:engram-memory' as const,
      plan_generation: '3',
      connector_instance_id: 'conn_inst_01',
    } as const;
    expect(
      evaluateMemorySelectionAndRevocationV1({
        ...base,
        cache_key: withInstance,
      }),
    ).toEqual({ allowed: true });
    expect(
      evaluateMemorySelectionAndRevocationV1({
        ...base,
        cache_key: { ...withInstance, connector_instance_id: 'conn_inst_02' },
      }),
    ).toEqual({ allowed: true });
  });

  it('nested dialect mismatch is refused at every level', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
      properties: {
        purpose_ref: {
          $schema: 'http://json-schema.org/draft-07/schema#',
          type: 'string',
        },
      },
    };
    expect(
      validateMemoryToolSchemaDialectV1(
        schema,
        undefined,
        '$',
      ).ok,
    ).toBe(false);
  });

  it('publisher entry refuses non-SemVer entry/manifest versions', () => {
    expect(
      validateMemoryPublisherEntryV1({
        ...ENGRAM_MEMORY_PUBLISHER_ENTRY_V1,
        entry_version: 'banana',
        manifest_version: 'banana',
      }).ok,
    ).toBe(false);
    expect(
      validateMemoryPublisherEntryV1(ENGRAM_MEMORY_PUBLISHER_ENTRY_V1).ok,
    ).toBe(true);
  });

  it('envelope equivalence ignores JSON member order', () => {
    const page = {
      records: [],
      rank_receipt: {
        request_digest: `sha256:${'a'.repeat(64)}`,
        authorization_receipt_digest: `sha256:${'b'.repeat(64)}`,
        profile: 'offline_lexical_v1' as const,
        profile_version: '1.0.0',
        profile_config_digest: `sha256:${'c'.repeat(64)}`,
        valid_as_of: 1792238400000,
        system_as_of: '42',
        snapshot_id: 'snap_01',
        snapshot_digest: `sha256:${'d'.repeat(64)}`,
        candidate_count: 0,
        candidate_ids_digest: `sha256:${'a'.repeat(64)}`,
        scoring_formula_ref: 'bm25_v1',
        ordered_ids_digest: `sha256:${'b'.repeat(64)}`,
        revalidation_receipt_digest: `sha256:${'c'.repeat(64)}`,
        projection_receipt_digests: [] as string[],
        issued_at: '2026-10-17T12:00:00.000Z',
        receipt_digest: `sha256:${'a'.repeat(64)}`,
      },
      response_digest: `sha256:${'d'.repeat(64)}`,
    };
    const resp = createToolSuccessEnvelope(page, 'audit_search_001');
    expect(validateMcpToolCallResponseV1('engram_memory_search', resp).ok).toBe(
      true,
    );
    const sc = resp.structuredContent as unknown as Record<string, unknown>;
    const reorderedStructuredContent = {
      redactionClass: sc['redactionClass'],
      auditId: sc['auditId'],
      output: sc['output'],
      ok: sc['ok'],
    };
    const reorderedText = JSON.stringify({
      ok: (sc as { ok: unknown }).ok,
      redactionClass: sc['redactionClass'],
      output: sc['output'],
      auditId: sc['auditId'],
    });
    const reordered = {
      isError: false,
      structuredContent: reorderedStructuredContent,
      content: [{ type: 'text', text: reorderedText }],
    };
    expect(
      validateMcpToolCallResponseV1('engram_memory_search', reordered).ok,
    ).toBe(true);
  });
});
